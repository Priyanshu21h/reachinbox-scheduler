import { z } from 'zod';

const email = z.string().trim().email().max(254).transform((value) => value.toLowerCase());
const password = z.string().min(12, 'Password must be at least 12 characters').max(128, 'Password must be 128 characters or fewer');
const token = z.string().min(40).max(100);

export const RequestEmailSchema = z.object({ email });
export const LoginEmailSchema = z.object({ email, password: z.string().min(1).max(128) });
export const CompleteRegistrationSchema = z.object({
  token,
  name: z.string().trim().min(1).max(100),
  password,
});
export const CompletePasswordResetSchema = z.object({ token, password });
