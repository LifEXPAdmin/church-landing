import assert from "node:assert/strict";
import {readFileSync,writeFileSync,existsSync} from "node:fs";
import {randomUUID,createHash} from "node:crypto";
import {PrismaClient} from "@prisma/client";
import {createPortalActor,assertPortalTestDatabase} from "../tests/seed-portal.ts";
import {groupCommand} from "../lib/platform/group-commands.ts";
import {listGroups} from "../lib/platform/group-reads.ts";
import {readGroupDiscussions} from "../lib/platform/group-discussions.ts";
const [fixturePath,outputPath]=process.argv.slice(2);assert.ok(fixturePath&&outputPath);
let queries=[];const db=new PrismaClient({log:[{emit:"event",level:"query"}]});db.$on("query",e=>queries.push(e.query));await assertPortalTestDatabase(db);
let f;
try {
 if(existsSync(fixturePath)) f=JSON.parse(readFileSync(fixturePath));
 else {
 const owner=await createPortalActor(db,"gcost"), prefix="gcost-"+randomUUID();
 const result=await groupCommand(db,owner.token,{operation:"create",mutationId:randomUUID(),schema:1,slug:prefix+"-0",fields:{name:prefix+" 0",purpose:"Isolated bounded cost fixture",rules:"Private adult discussions",kind:"INTEREST",discovery:"LISTED",joinPolicy:"OPEN",format:"LOCAL",area:"Fictional town",topic:"Music",churchId:null},acceptedRules:true,leaderDisclosure:true});
 const original=await db.gatherGroup.findUniqueOrThrow({where:{id:result.id}}), member=await db.gatherGroupMembership.findUniqueOrThrow({where:{groupId_userId:{groupId:result.id,userId:owner.id}}});
 for(let i=1;i<20;i++){const id=randomUUID();await db.gatherGroup.create({data:{...original,id,slug:prefix+"-"+i,name:prefix+" "+i,nameKey:prefix+" "+i}});await db.gatherGroupMembership.create({data:{...member,id:randomUUID(),groupId:id}});}
 await db.platformPost.createMany({data:Array.from({length:20},(_,i)=>({id:randomUUID(),authorId:owner.id,groupId:result.id,audience:"GROUP",groupThreadKind:"DISCUSSION",groupCategory:"GENERAL",content:"Fictional bounded group post "+i,status:"PUBLISHED",publishedAt:new Date(Date.now()-i*1000)}))});
 const posts=await db.platformPost.findMany({where:{groupId:result.id},select:{id:true}});
 await db.platformPostComment.createMany({data:posts.flatMap(p=>Array.from({length:3},(_,i)=>({postId:p.id,authorId:owner.id,groupId:result.id,content:"Fictional reply "+i})))});
 f={owner,prefix,groupId:result.id};writeFileSync(fixturePath,JSON.stringify(f),{mode:0o600});
 }
 const results=[];
 for(const [name,work] of [["guest listed page of 20",()=>listGroups(db,undefined,{q:f.prefix})],["member listed page of 20",()=>listGroups(db,f.owner.token,{q:f.prefix})],["private discussion page of 20",()=>readGroupDiscussions(db,f.owner.token,{groupId:f.groupId})]]) {
   await work();const runs=[];for(let i=0;i<5;i++){queries=[];const start=performance.now(),value=await work();runs.push({ms:performance.now()-start,selects:queries.filter(q=>/^SELECT/i.test(q)).length,hash:createHash("sha256").update(JSON.stringify(value)).digest("hex")});}
   assert.equal(new Set(runs.map(r=>r.hash)).size,1);results.push({name,runs});
 }
 writeFileSync(outputPath,JSON.stringify({at:new Date().toISOString(),isolated:true,results},null,2),{mode:0o600});console.log(JSON.stringify(results.map(r=>({name:r.name,selects:r.runs[0].selects,medianMs:r.runs.map(x=>x.ms).sort((a,b)=>a-b)[2],hash:r.runs[0].hash}))));
}finally{await db.$disconnect();}
