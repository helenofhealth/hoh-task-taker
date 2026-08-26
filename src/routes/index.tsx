import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Helen of Health Task Taker — Task board & time tracking" },
      {
        name: "description",
        content:
          "Track client tasks, statuses and billable time in 15-minute increments with live client hour balances.",
      },
      { property: "og:title", content: "Helen of Health Task Taker — Task board & time tracking" },
      {
        property: "og:description",
        content: "Track tasks, time and client hours in one calm, colourful workspace.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://tasks.helenofhealth.com/" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Helen of Health Task Taker — Task board & time tracking" },
      {
        name: "twitter:description",
        content: "Track tasks, time and client hours in one calm, colourful workspace.",
      },
    ],
    links: [{ rel: "canonical", href: "https://tasks.helenofhealth.com/" }],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/board" });
  },
  component: () => null,
});
