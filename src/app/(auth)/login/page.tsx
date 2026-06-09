import { redirect } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LoginForm } from "@/components/auth/login-form";
import { getCurrentUser } from "@/server/auth/session";

export const metadata = { title: "Sign in · LoopyFriday" };

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/sessions");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>Welcome back to LoopyFriday.</CardDescription>
      </CardHeader>
      <CardContent>
        <LoginForm />
      </CardContent>
    </Card>
  );
}
