export type Role = "admin" | "team_captain" | "player";

export type TeamStatus = "pending" | "approved" | "rejected";

export type MatchStatus =
  | "scheduled"
  | "live"
  | "awaiting_scores"
  | "disputed"
  | "finished";

export interface ScoreSubmission {
  score_own: number;
  score_opponent: number;
  screenshot_url: string;
  submitted_by: string;
  submitted_at: string;
}

export type TeamDivision = "boys" | "girls";

export interface Team {
  id: string;
  team_name: string;
  logo_url: string | null;
  category?: TeamDivision;
  display_order?: number | null;
  discord: string | null;
  whatsapp: string | null;
  email: string | null;
  phone: string | null;
  captain_id: string;
  status: TeamStatus;
  points: number;
  wins: number;
  losses: number;
  draws: number;
  maps_won: number;
  maps_lost: number;
  created_at: string;
}

export interface Player {
  id: string;
  team_id: string;
  player_name: string;
  game_id: string;
  is_substitute: boolean;
}

export interface Match {
  id: string;
  round: number;
  bracket_slot: number;
  team1_id: string | null;
  team2_id: string | null;
  map: string | null;
  scheduled_time: string | null;
  stream_url: string | null;
  status: MatchStatus;
  submission_team1: ScoreSubmission | null;
  submission_team2: ScoreSubmission | null;
  final_score1: number | null;
  final_score2: number | null;
  /** Live in-progress score pushed by the admin during a running match. */
  live_score1: number | null;
  live_score2: number | null;
  winner_id: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  team1?: Pick<Team, "id" | "team_name" | "logo_url"> | null;
  team2?: Pick<Team, "id" | "team_name" | "logo_url"> | null;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  created_at: string;
}

export const MAP_POOL = ["Crash", "Crossfire", "Backlot", "Strike", "District"];

export const ROUND_NAMES: Record<number, string> = {
  1: "Round of 16",
  2: "Quarter-finals",
  3: "Semi-finals",
  4: "Grand Final",
};
