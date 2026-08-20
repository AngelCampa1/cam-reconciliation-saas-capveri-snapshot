"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle } from "lucide-react";
import { fieldLabel } from "./fieldLabel";

export type LeaseField = {
  field: string;
  value: string;
  source: string;
  isBadge?: boolean;
};

export type CaseStudy = {
  id: string;
  tabLabel: string;
  propertyName: string;
  tenant: string;
  leaseType: string;
  leaseTypeBadgeVariant: "default" | "secondary" | "outline";
  fields: LeaseField[];
  advantage: string;
  advantageDetail: string;
};

type Props = {
  studies: CaseStudy[];
};

export function CaseStudyTabs({ studies }: Props) {
  if (!studies.length) return null;
  return (
    <Tabs defaultValue={studies[0].id}>
      <div className="overflow-x-auto">
        <TabsList className="whitespace-nowrap mb-8">
          {studies.map((s) => (
            <TabsTrigger key={s.id} value={s.id}>
              {s.tabLabel}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>

      {studies.map((s) => (
        <TabsContent key={s.id} value={s.id}>
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center gap-3">
                <CardTitle className="text-lg">
                  {s.propertyName} - {s.tenant}
                </CardTitle>
                <Badge variant={s.leaseTypeBadgeVariant}>{s.leaseType}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                {/* Fields - left 2/3 */}
                <div className="md:col-span-2">
                  <Card className="overflow-hidden">
                    {/* Desktop: 3-column grid table */}
                    <CardHeader className="hidden md:block bg-muted/50 py-3">
                      <div className="grid md:grid-cols-3 text-sm font-semibold text-muted-foreground">
                        <span>Field</span>
                        <span>Value</span>
                        <span>Source</span>
                      </div>
                    </CardHeader>
                    <CardContent className="hidden md:block p-0">
                      {s.fields.map((f) => (
                        <div
                          key={f.field}
                          className="grid md:grid-cols-3 items-center px-6 py-3 border-b last:border-b-0 text-base"
                        >
                          <span className="font-medium text-muted-foreground text-sm">
                            {fieldLabel(f.field)}
                          </span>
                          {f.isBadge ? (
                            <Badge variant="outline" className="w-fit">
                              {f.value}
                            </Badge>
                          ) : (
                            <span className="font-medium">{f.value}</span>
                          )}
                          <span className="text-muted-foreground text-xs">
                            {f.source}
                          </span>
                        </div>
                      ))}
                    </CardContent>
                    {/* Mobile: stacked card variant */}
                    <CardContent className="md:hidden p-0">
                      <ul className="divide-y">
                        {s.fields.map((f) => (
                          <li key={f.field} className="px-4 py-3 space-y-1">
                            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              {fieldLabel(f.field)}
                            </div>
                            <div>
                              {f.isBadge ? (
                                <Badge variant="outline" className="w-fit">
                                  {f.value}
                                </Badge>
                              ) : (
                                <span className="text-base font-medium">
                                  {f.value}
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Source: {f.source}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                </div>

                {/* Advantage callout - right 1/3 */}
                <div>
                  <div className="bg-primary/5 border border-primary/10 rounded-lg p-6 h-full">
                    <div className="flex items-center gap-2 mb-3">
                      <CheckCircle className="h-5 w-5 text-primary shrink-0" />
                      <span className="font-semibold text-sm">
                        Why it matters
                      </span>
                    </div>
                    <p className="text-sm font-medium mb-2">{s.advantage}</p>
                    <p className="text-sm text-muted-foreground">
                      {s.advantageDetail}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      ))}
    </Tabs>
  );
}
