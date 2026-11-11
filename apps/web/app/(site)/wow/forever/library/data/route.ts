import { NextRequest, NextResponse } from "next/server";
import { FOREVER_BUILD, isForeverType } from "@/lib/forever/database/contract";
import { foreverRecord, foreverSearch, type ForeverQuery } from "@/lib/forever/database/server";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const params=request.nextUrl.searchParams;
  if ((params.has("edition") && params.get("edition")!=="forever") || (params.has("build") && params.get("build")!==FOREVER_BUILD)) return NextResponse.json({error:"edition_build_mismatch"},{status:409});
  if (params.has("type") && !isForeverType(params.get("type"))) return NextResponse.json({error:"invalid_type"},{status:400});
  try {
    if (params.has("id")) {
      const type=params.get("type"),id=params.get("id")!;
      if (!isForeverType(type) || !/^[1-9]\d{0,9}$/.test(id)) return NextResponse.json({error:"invalid_identity"},{status:400});
      const record=await foreverRecord(type,Number(id));
      return NextResponse.json(record ?? {error:"not_found"},{status:record?200:404});
    }
    const query: ForeverQuery={};
    for(const key of ["type","q","page","quality","category","minLevel","maxLevel","related","edge"] as const) query[key]=params.get(key)??undefined;
    return NextResponse.json({...await foreverSearch(query),build:FOREVER_BUILD});
  } catch {
    return NextResponse.json({error:"temporarily_unavailable"},{status:503,headers:{"Retry-After":"30"}});
  }
}
