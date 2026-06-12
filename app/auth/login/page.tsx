import { LoginForm } from "@/components/login-form";
import { getAuthErrorMessage } from "@/lib/auth/messages";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const initialError = params.error ? getAuthErrorMessage(params.error) : null;

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <LoginForm initialError={initialError} />
      </div>
    </div>
  );
}
