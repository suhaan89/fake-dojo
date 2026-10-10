import type { Metadata } from "next";
import { ProfileClient } from "./ProfileClient";

export const metadata: Metadata = {
  title: "Profile",
  description: "Your belt, your points and your skill per manipulation type.",
};

export default function ProfilePage() {
  return <ProfileClient />;
}
