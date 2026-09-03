import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { resolvePostAuthPath } from "@/lib/post-auth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Helen of Health Task Taker — Task board & time tracking" },
      {
        name: "description",
        content:
          "Track client tasks, statuses and billable time in 15-minute increments with live client hour balances.",
      },
      { property: "og:title", content: "Helen of Health Task Taker — Task board & time tracking" },
      {
        property: "og:description",
        content: "Track tasks, time and client hours in one calm, colourful workspace.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://tasks.helenofhealth.com/" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Helen of Health Task Taker — Task board & time tracking" },
      {
        name: "twitter:description",
        content: "Track tasks, time and client hours in one calm, colourful workspace.",
      },
    ],
    links: [{ rel: "canonical", href: "https://tasks.helenofhealth.com/" }],
  }),
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth", search: { next: undefined } });
    // Google OAuth returns to "/" — send people to the page that fits their role.
    throw redirect({ href: await resolvePostAuthPath(data.user.id) });
  },
  component: () => null,
});
