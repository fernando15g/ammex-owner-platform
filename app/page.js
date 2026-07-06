// Root — open the app on the first real zone (Active Work). Home-the-zone is built later.
import { redirect } from "next/navigation";
export default function Root() {
  redirect("/active");
}
