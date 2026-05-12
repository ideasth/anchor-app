// Stage 16 (2026-05-12) — Candidate time slot cards.
// Display only in V1 — no booking action.

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export interface CandidateSlot {
  start: string;
  end: string;
  meetingStart: string;
  meetingEnd: string;
  locationType: string;
  locationLabel: string | null;
  travelApplied: boolean;
  reasonSummary: string;
}

interface Props {
  candidates: CandidateSlot[];
}

function fmtDateTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-AU", {
      timeZone: "Australia/Melbourne",
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function CandidateSlots({ candidates }: Props) {
  if (candidates.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic" data-testid="no-candidates">
        No available slots found in the requested window.
      </p>
    );
  }

  return (
    <div className="space-y-3" data-testid="candidate-slots">
      {candidates.map((slot, i) => (
        <Card key={i} data-testid={`candidate-${i}`} className="border-border">
          <CardContent className="pt-4 pb-3 flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-sm">
                {fmtDateTime(slot.meetingStart)}
              </span>
              <span className="text-muted-foreground text-xs">
                &ndash; {fmtDateTime(slot.meetingEnd)}
              </span>

              {slot.locationType === "online" && (
                <Badge variant="secondary" data-testid={`badge-online-${i}`}>
                  Online
                </Badge>
              )}
              {slot.locationType === "in_person" && (
                <Badge variant="secondary" data-testid={`badge-inperson-${i}`}>
                  In person
                </Badge>
              )}
              {slot.travelApplied && (
                <Badge variant="outline" data-testid={`badge-travel-${i}`}>
                  Travel included
                </Badge>
              )}
            </div>

            {slot.locationLabel && (
              <p className="text-xs text-muted-foreground">
                Location: {slot.locationLabel}
              </p>
            )}

            <p className="text-xs text-muted-foreground italic" data-testid={`reason-${i}`}>
              {slot.reasonSummary}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
