import React from "react";
import { usePrivy } from "@privy-io/react-auth";
import { Button } from "@/components/ui/button";

type Step = {
  title: string;
  description: string;
};

const STEPS: Step[] = [
  {
    title: "Connect",
    description: "Connect to app to get started.",
  },
  {
    title: "Create Event",
    description: "Set up event details, pricing, and publish onchain.",
  },
  {
    title: "Share & Sell",
    description: "Share your event link and sell tickets.",
  },
];

export const GetStartedSteps: React.FC = () => {
  const { authenticated, login } = usePrivy();

  return (
    <section className="w-full bg-white py-16">
      <div className="mx-auto flex max-w-5xl flex-col gap-10 px-4 sm:px-6 lg:px-8">
        <header className="text-center">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-purple-500">
            How TeeRex Works
          </p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-gray-900 sm:text-3xl">
            Get started in 3 easy steps
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-gray-600 sm:text-base">
            From idea to onchain tickets in minutes. No complex setup, just a clear
            flow your attendees can trust.
          </p>
        </header>
        <div className="grid gap-8 md:grid-cols-3">
          {STEPS.map((step, index) => (
            <div
              key={step.title}
              className="flex flex-col items-center rounded-2xl border border-purple-100 bg-white p-6 text-center shadow-sm shadow-purple-100/60"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-purple-600 text-lg font-semibold text-white shadow-md shadow-purple-300">
                {index + 1}
              </div>
              <h3 className="mt-4 text-base font-semibold text-gray-900">
                {step.title}
              </h3>
              <p className="mt-2 text-sm text-gray-600">{step.description}</p>
            </div>
          ))}
        </div>
        {!authenticated && (
          <div className="text-center">
            <Button
              size="lg"
              className="bg-purple-600 hover:bg-purple-700 text-white px-8 py-4 text-lg font-medium rounded-xl"
              onClick={login}
            >
              Get started
            </Button>
          </div>
        )}
      </div>
    </section>
  );
};
