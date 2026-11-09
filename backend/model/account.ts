import { z } from "zod"

export const Register = z.object({
  name: z.string().trim().min(1, "Enter your name").max(100),
  email: z.email("Enter a valid email").max(200),
  phone: z.string().trim().max(30).default(""),
  password: z.string().min(8, "Use at least 8 characters").max(200)
})

export const Login = z.object({
  email: z.email("Enter a valid email").max(200),
  password: z.string().min(1, "Enter your password").max(200)
})

export const AdminLogin = z.object({
  password: z.string().min(1).max(200)
})

export const Customer = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  phone: z.string()
})
export type Customer = z.infer<typeof Customer>
