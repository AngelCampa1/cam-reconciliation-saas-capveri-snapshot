"use client";

import {
  AuditPacketMock,
  CapVeriDemoFrame,
  ExceptionQueueMock,
  LeaseRulesMock,
} from "@/components/product-demo";
import { cn } from "@/lib/utils";

export interface ProductDemoSectionProps {
  className?: string;
}

export function ProductDemoSection({ className }: ProductDemoSectionProps) {
  return (
    <section className={cn("border-y bg-muted/20 py-20", className)}>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-10 max-w-2xl">
          <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-primary">
            Product preview
          </p>
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl lg:text-5xl">
            Review rules, clear exceptions, export the packet.
          </h2>
          <p className="mt-5 text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
            The screens below use sample data. They show the workflow. Confirm
            the rules, clear exceptions, and export the packet with the backup
            your tenants will ask for.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[0.95fr_1.05fr]">
          <CapVeriDemoFrame
            title="Lease rules"
            subtitle="Mapped rules show exactly which lease terms govern each check."
          >
            <LeaseRulesMock />
          </CapVeriDemoFrame>
          <CapVeriDemoFrame
            title="Exception queue"
            subtitle="Exceptions are routed for review before statements go out."
          >
            <ExceptionQueueMock />
          </CapVeriDemoFrame>
        </div>

        <CapVeriDemoFrame
          className="mt-5"
          title="Audit packet"
          subtitle="Demo packet structure for tenant-ready support and audit backup."
        >
          <AuditPacketMock />
        </CapVeriDemoFrame>
      </div>
    </section>
  );
}
