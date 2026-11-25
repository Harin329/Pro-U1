import type { Metadata } from "next";
import Link from "next/link";

import { CoursePicker } from "@/components/course-picker";

export const metadata: Metadata = {
  title: "Random Course Picker",
  description: "Can't decide where to play? Pick a random golf course within driving distance.",
};

export default function CoursePickerPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 md:px-6 md:py-10">
      <header className="mb-6">
        <Link
          href="/"
          className="text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
        >
          ← Golf Ball Dashboard
        </Link>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">Random Course Picker</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
          Can&apos;t decide where to play this weekend? Pick a starting point and how far you&apos;ll drive, then let
          the picker choose.
        </p>
      </header>

      <CoursePicker />
    </main>
  );
}
