import Image from "next/image";
import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 gap-8">
      <Image
        src="/logo.png"
        alt="The Product Bus"
        width={220}
        height={66}
        className="object-contain"
        priority
      />
      <SignIn />
    </div>
  );
}
