import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  AuditPacketMock,
  CapVeriDemoFrame,
  ExceptionQueueMock,
  LeaseRulesMock,
  ReconciliationDashboardMock,
} from "../index";

describe("product demo mocks", () => {
  it("renders an accessible synthetic demo frame", () => {
    render(
      <CapVeriDemoFrame>
        <ReconciliationDashboardMock />
      </CapVeriDemoFrame>,
    );

    expect(
      screen.getByLabelText("Reconciliation dashboard"),
    ).toBeInTheDocument();
    expect(screen.getByText("Sample data")).toBeInTheDocument();
    expect(screen.getByText("Northline Plaza")).toBeInTheDocument();
  });

  it("renders lease rules, exception queue, and audit packet sections", () => {
    render(
      <CapVeriDemoFrame>
        <div>
          <LeaseRulesMock />
          <ExceptionQueueMock />
          <AuditPacketMock />
        </div>
      </CapVeriDemoFrame>,
    );

    expect(
      screen.getByLabelText("Synthetic lease rules preview"),
    ).toBeVisible();
    expect(
      screen.getByLabelText("Synthetic exception queue preview"),
    ).toBeVisible();
    expect(
      screen.getByLabelText("Synthetic audit packet preview"),
    ).toBeVisible();
    expect(screen.getByText("Admin fee capped at 5%")).toBeInTheDocument();
    expect(
      screen.getByText("Missing snow removal invoice"),
    ).toBeInTheDocument();
    expect(screen.getByText("Calculation workbook")).toBeInTheDocument();
  });
});
