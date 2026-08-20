import React from "react";

interface StepProps {
  title: string;
  children: React.ReactNode;
}

export function Step({ title, children }: StepProps) {
  return (
    <div data-step>
      <span data-step-title>{title}</span>
      {children}
    </div>
  );
}

interface StepsProps {
  children: React.ReactNode;
}

export function Steps({ children }: StepsProps) {
  const steps = React.Children.toArray(children).filter(React.isValidElement);
  return (
    <div className="not-prose space-y-4 mb-6">
      {steps.map((child, index) => {
        const props = child.props as {
          title?: string;
          children?: React.ReactNode;
        };
        return (
          <div key={props.title ?? index} className="flex gap-4 items-start">
            <span className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-semibold text-sm">
              {index + 1}
            </span>
            <div>
              {props.title && <h3 className="font-semibold">{props.title}</h3>}
              <div className="text-muted-foreground text-base [&>p]:mb-0">
                {props.children}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
