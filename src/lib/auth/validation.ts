const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateEmail(email: string): string | undefined {
  if (!email.trim()) return 'Enter your work email address.';
  if (!EMAIL_PATTERN.test(email.trim())) return 'Enter a valid email address, for example name@company.com.';
  return undefined;
}

export function validateSignIn(email: string, password: string): { email?: string; password?: string } {
  const errors: { email?: string; password?: string } = {};
  const emailError = validateEmail(email);
  if (emailError) errors.email = emailError;
  if (!password) errors.password = 'Enter your password.';
  return errors;
}

