import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Pencil, Plus, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMe } from "@/hooks/useAuth";
import {
  inviteTeamMember,
  listTeamMembers,
  updateTeamMember,
  type TeamMember,
} from "@/lib/team.functions";

export const Route = createFileRoute("/_authenticated/team")({
  head: () => ({
    meta: [
      { title: "Team members — Helen of Health Task Taker" },
      { name: "description", content: "Manage team members, roles, and hourly rates." },
      { property: "og:title", content: "Team members — Helen of Health Task Taker" },
      { property: "og:description", content: "Manage team members, roles, and hourly rates." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://tasks.helenofhealth.com/team" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
    links: [{ rel: "canonical", href: "https://tasks.helenofhealth.com/team" }],
  }),

  component: TeamPage,
});

interface FormState {
  userId?: string;
  name: string;
  email: string;
  phone: string;
  role: "admin" | "member";
  hourlyRate: string;
}

const emptyForm: FormState = { name: "", email: "", phone: "", role: "member", hourlyRate: "" };

function TeamPage() {
  const me = useMe();

  if (!me.isStaff) {
    return (
      <AppShell>
        <p className="text-muted-foreground">Only team members can view this page.</p>
      </AppShell>
    );
  }

  return <StaffTeamPage />;
}

function StaffTeamPage() {
  const me = useMe();
  const qc = useQueryClient();
  const listFn = useServerFn(listTeamMembers);
  const inviteFn = useServerFn(inviteTeamMember);
  const updateFn = useServerFn(updateTeamMember);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const editing = !!form.userId;

  const members = useQuery({
    queryKey: ["team-members"],
    queryFn: () => listFn(),
  });

  const save = useMutation({
    mutationFn: async () => {
      const hourlyRate = form.hourlyRate.trim() === "" ? 0 : Number(form.hourlyRate);
      if (editing) {
        await updateFn({
          data: {
            userId: form.userId!,
            name: form.name,
            phone: form.phone || undefined,
            role: form.role,
            hourlyRate,
          },
        });
      } else {
        await inviteFn({
          data: {
            name: form.name,
            email: form.email,
            phone: form.phone || undefined,
            role: form.role,
            hourlyRate,
            origin: window.location.origin,
          },
        });
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Team member updated" : "Invitation sent");
      setDialogOpen(false);
      setForm(emptyForm);
      qc.invalidateQueries({ queryKey: ["team-members"] });
      qc.invalidateQueries({ queryKey: ["profiles"] });
      qc.invalidateQueries({ queryKey: ["roles"] });
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <AppShell>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Users className="size-6 text-primary" /> Team members
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {me.isAdmin
              ? "Invite team members, set their role and hourly rate."
              : "The people on your team."}
          </p>
        </div>
        {me.isAdmin && (
          <Button
            onClick={() => {
              setForm(emptyForm);
              setDialogOpen(true);
            }}
          >
            <Plus className="mr-2 size-4" /> Add team member
          </Button>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-5 py-3 font-medium">Name</th>
              <th className="px-5 py-3 font-medium">Email</th>
              <th className="px-5 py-3 font-medium">Phone</th>
              <th className="px-5 py-3 font-medium">Role</th>
              {me.isAdmin && <th className="px-5 py-3 text-right font-medium">Hourly rate</th>}
              {me.isAdmin && <th className="px-5 py-3" />}
            </tr>
          </thead>
          <tbody>
            {(members.data ?? []).map((m) => (
              <tr key={m.userId} className="border-b border-border last:border-0">
                <td className="px-5 py-3 font-medium">{m.name}</td>
                <td className="px-5 py-3 text-muted-foreground">{m.email}</td>
                <td className="px-5 py-3 text-muted-foreground">{m.phone || "—"}</td>
                <td className="px-5 py-3">
                  <Badge variant={m.role === "admin" ? "default" : "secondary"}>
                    {m.role === "admin" ? "Admin" : "User"}
                  </Badge>
                </td>
                {me.isAdmin && (
                  <td className="px-5 py-3 text-right tabular-nums">
                    €{(m.hourlyRate ?? 0).toFixed(2)}
                  </td>
                )}
                {me.isAdmin && (
                  <td className="px-5 py-3 text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setForm({
                          userId: m.userId,
                          name: m.name,
                          email: m.email,
                          phone: m.phone ?? "",
                          role: m.role,
                          hourlyRate: String(m.hourlyRate ?? 0),
                        });
                        setDialogOpen(true);
                      }}
                    >
                      <Pencil className="size-4" />
                    </Button>
                  </td>
                )}
              </tr>
            ))}
            {members.data?.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-muted-foreground">
                  No team members yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit team member" : "Add team member"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "Update their details, role, and hourly rate."
                : "They'll receive an activation email to set up their account."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="tm-name">Name</Label>
              <Input
                id="tm-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Jane Doe"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tm-email">Email</Label>
              <Input
                id="tm-email"
                type="email"
                value={form.email}
                disabled={editing}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="jane@helenofhealth.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tm-phone">Phone (optional)</Label>
              <Input
                id="tm-phone"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="+30 …"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select
                value={form.role}
                onValueChange={(v) => setForm({ ...form, role: v as "admin" | "member" })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">User</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tm-rate">Hourly rate (€)</Label>
              <Input
                id="tm-rate"
                type="number"
                min="0"
                step="0.01"
                value={form.hourlyRate}
                onChange={(e) => setForm({ ...form, hourlyRate: e.target.value })}
                placeholder="0.00"
              />
              <p className="text-xs text-muted-foreground">Only admins can see this value.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => save.mutate()}
              disabled={save.isPending || !form.name.trim() || (!editing && !form.email.trim())}
            >
              {save.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              {editing ? "Save changes" : "Send invitation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
