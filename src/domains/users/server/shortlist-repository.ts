import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { dataAccessError, notFoundError } from "@/shared/errors/application-error";
import { locationIdSchema } from "@/types/contracts";

const shortlistRowsSchema = z.array(z.object({
  location_id: locationIdSchema,
}));
const locationRowsSchema = z.array(z.object({ id: locationIdSchema }));

export type ShortlistMergeResult = {
  ids: string[];
  mergedCount: number;
  ignoredCount: number;
};

export interface UserShortlistRepository {
  list(userId: string): Promise<string[]>;
  setSaved(userId: string, locationId: string, saved: boolean): Promise<string[]>;
  merge(userId: string, locationIds: readonly string[]): Promise<ShortlistMergeResult>;
}

function parseShortlistRows(data: unknown): string[] {
  const parsed = shortlistRowsSchema.safeParse(data);
  if (!parsed.success) throw dataAccessError("Unexpected user shortlist response shape", parsed.error);
  return parsed.data.map((row) => row.location_id);
}

function parseLocationRows(data: unknown): string[] {
  const parsed = locationRowsSchema.safeParse(data);
  if (!parsed.success) throw dataAccessError("Unexpected location validation response shape", parsed.error);
  return parsed.data.map((row) => row.id);
}

export function createSupabaseUserShortlistRepository(
  client: SupabaseClient,
): UserShortlistRepository {
  async function list(userId: string): Promise<string[]> {
    const { data, error } = await client
      .from("user_shortlist")
      .select("location_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .order("location_id", { ascending: true });
    if (error) throw dataAccessError("Failed to list the authenticated user's shortlist", error);
    return parseShortlistRows(data);
  }

  async function validLocationIds(locationIds: readonly string[]): Promise<string[]> {
    if (locationIds.length === 0) return [];
    const { data, error } = await client
      .from("locations")
      .select("id")
      .in("id", [...locationIds]);
    if (error) throw dataAccessError("Failed to validate shortlist location ids", error);
    return parseLocationRows(data);
  }

  async function setSaved(userId: string, locationId: string, saved: boolean): Promise<string[]> {
    if (saved) {
      const validIds = await validLocationIds([locationId]);
      if (!validIds.includes(locationId)) throw notFoundError(`Shortlist location ${locationId} does not exist`);
      const { error } = await client
        .from("user_shortlist")
        .upsert(
          { user_id: userId, location_id: locationId },
          { onConflict: "user_id,location_id", ignoreDuplicates: true },
        );
      if (error) throw dataAccessError("Failed to save the authenticated user's shortlist item", error);
    } else {
      const { error } = await client
        .from("user_shortlist")
        .delete()
        .eq("user_id", userId)
        .eq("location_id", locationId);
      if (error) throw dataAccessError("Failed to remove the authenticated user's shortlist item", error);
    }
    return list(userId);
  }

  async function merge(userId: string, locationIds: readonly string[]): Promise<ShortlistMergeResult> {
    const candidates = [...new Set(locationIds)];
    const before = new Set(await list(userId));
    const validIds = await validLocationIds(candidates);
    if (validIds.length > 0) {
      const { error } = await client
        .from("user_shortlist")
        .upsert(
          validIds.map((locationId) => ({ user_id: userId, location_id: locationId })),
          { onConflict: "user_id,location_id", ignoreDuplicates: true },
        );
      if (error) throw dataAccessError("Failed to merge browser shortlist items", error);
    }
    const ids = await list(userId);
    const after = new Set(ids);
    return {
      ids,
      mergedCount: validIds.filter((id) => !before.has(id) && after.has(id)).length,
      ignoredCount: candidates.length - validIds.length,
    };
  }

  return { list, setSaved, merge };
}
