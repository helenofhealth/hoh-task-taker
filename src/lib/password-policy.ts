// Shared password strength rules for sign-up, invitations and password resets.
export const PASSWORD_MIN_LENGTH = 8;

export interface PasswordRule {
  id: string;
  label: string;
  test: (value: string) => boolean;
}

export const PASSWORD_RULES: PasswordRule[] = [
  { id: "length", label: `At least ${PASSWORD_MIN_LENGTH} characters`, test: (v) => v.length >= PASSWORD_MIN_LENGTH },
  { id: "upper", label: "At least 1 uppercase letter", test: (v) => /[A-Z]/.test(v) },
  { id: "number", label: "At least 1 number", test: (v) => /[0-9]/.test(v) },
  {
    id: "special",
    label: "At least 1 special character",
    test: (v) => /[^A-Za-z0-9]/.test(v),
  },
];

/** Returns null when the password satisfies every rule, otherwise the first failure message. */
export function validatePassword(value: string): string | null {
  const failed = PASSWORD_RULES.filter((r) => !r.test(value));
  if (failed.length === 0) return null;
  return `Password must contain: ${failed.map((r) => r.label.replace(/^At least /, "").toLowerCase()).join(", ")}`;
}

export function isPasswordValid(value: string): boolean {
  return PASSWORD_RULES.every((r) => r.test(value));
}
