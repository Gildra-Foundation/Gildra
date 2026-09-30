import { WCL_USER_API_URL } from "./warcraftLogsAuth.ts";

export class WarcraftLogsError extends Error {
  code: "unauthorized" | "rate_limited" | "not_found" | "upstream";
  status: number;
  constructor(code: "unauthorized" | "rate_limited" | "not_found" | "upstream", status: number) { super(code); this.code = code; this.status = status; }
}

export async function warcraftLogsGraphQL<T>(accessToken: string, query: string, variables: Record<string, unknown>, fetcher: typeof fetch = fetch): Promise<T> {
  const response = await fetcher(WCL_USER_API_URL, {
    method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query, variables }), cache: "no-store", signal: AbortSignal.timeout(12_000),
  });
  if (response.status === 401 || response.status === 403) throw new WarcraftLogsError("unauthorized", response.status);
  if (response.status === 429) throw new WarcraftLogsError("rate_limited", 429);
  if (!response.ok) throw new WarcraftLogsError("upstream", response.status);
  const payload = await response.json() as { data?: T; errors?: Array<{ message?: string }> };
  if (!payload.data || payload.errors?.length) {
    const missing = payload.errors?.some((error) => /not found|permission|private/i.test(error.message ?? ""));
    throw new WarcraftLogsError(missing ? "not_found" : "upstream", missing ? 404 : 502);
  }
  return payload.data;
}

export const reportQuery = `query Report($code:String!){reportData{report(code:$code,allowUnlisted:true){code title visibility startTime endTime zone{name} fights{ id name encounterID startTime endTime kill difficulty friendlyPlayers friendlySpecs } masterData(translate:true){actors{id name server type subType} abilities{gameID name}}}}}`;
export const currentUserQuery = `query CurrentUser{userData{currentUser{id name}}}`;
export const userReportsQuery = `query UserReports($user:Int!){reportData{reports(userID:$user,limit:25,page:1){data{code title visibility startTime endTime zone{name}} total}}}`;

export const analysisQuery = `query Analyze($code:String!,$fight:[Int],$actor:Int!){reportData{report(code:$code,allowUnlisted:true){code title visibility startTime fights(fightIDs:$fight){id name encounterID startTime endTime kill friendlyPlayers friendlySpecs talentImportCode(actorID:$actor)} masterData(translate:true){actors{id name server type subType} abilities{gameID name}} casts:events(dataType:Casts,fightIDs:$fight,sourceID:$actor,limit:10000){data nextPageTimestamp} buffs:events(dataType:Buffs,fightIDs:$fight,sourceID:$actor,limit:10000){data nextPageTimestamp} resources:events(dataType:Resources,fightIDs:$fight,sourceID:$actor,includeResources:true,limit:10000){data nextPageTimestamp} damageTable:table(dataType:DamageDone,fightIDs:$fight,sourceID:$actor) deaths:events(dataType:Deaths,fightIDs:$fight,limit:10000){data nextPageTimestamp}}}}`;

export const eventPageQuery = `query EventPage($code:String!,$fight:[Int],$actor:Int,$type:EventDataType!,$start:Float!,$resources:Boolean!){reportData{report(code:$code,allowUnlisted:true){events(dataType:$type,fightIDs:$fight,sourceID:$actor,startTime:$start,includeResources:$resources,limit:10000){data nextPageTimestamp}}}}`;
