// Puzzle generation: a seeded random number generator, a solution counter,
// and a generator that grows color regions around a random queen layout
// until the puzzle has exactly one solution.
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}

function countSolutions(reg,n,limit,out){
  // reg: Int8Array n*n region ids. Backtrack row by row.
  let count=0;const sol=new Int8Array(n);
  function rec(r,colMask,regMask,prev){
    if(r===n){count++;if(out&&count===1)out.first=Array.from(sol);if(out&&count===2)out.second=Array.from(sol);return count>=limit}
    for(let c=0;c<n;c++){
      if(colMask&(1<<c))continue;
      if(prev>=0&&Math.abs(c-prev)<2)continue;
      const g=reg[r*n+c];if(regMask&(1<<g))continue;
      sol[r]=c;
      if(rec(r+1,colMask|(1<<c),regMask|(1<<g),c))return true;
    }
    return false;
  }
  rec(0,0,0,-1);return count;
}

function randomQueens(n,rnd){
  const cols=[...Array(n).keys()];const sol=new Array(n);
  function rec(r){
    if(r===n)return true;
    const order=cols.slice().sort(()=>rnd()-.5);
    for(const c of order){
      if(sol.slice(0,r).includes(c))continue;
      if(r>0&&Math.abs(sol[r-1]-c)<2)continue;
      sol[r]=c;if(rec(r+1))return true;
    }
    return false;
  }
  rec(0);return sol;
}

function growRegions(n,sol,rnd){
  const reg=new Int8Array(n*n).fill(-1);
  const w=[];
  for(let r=0;r<n;r++){reg[r*n+sol[r]]=r;w.push(.3+rnd()*1.4)}
  let left=n*n-n;
  const dirs=[[1,0],[-1,0],[0,1],[0,-1]];
  while(left>0){
    // pick a region weighted, then a random frontier cell of it
    let tot=0;for(const x of w)tot+=x;
    let p=rnd()*tot,g=0;for(;g<n-1;g++){p-=w[g];if(p<=0)break}
    const front=[];
    for(let i=0;i<n*n;i++)if(reg[i]===g){
      const r=(i/n)|0,c=i%n;
      for(const[dr,dc]of dirs){const rr=r+dr,cc=c+dc;if(rr>=0&&rr<n&&cc>=0&&cc<n&&reg[rr*n+cc]===-1)front.push(rr*n+cc)}
    }
    if(!front.length){w[g]=0;if(w.every(x=>x===0))break;continue}
    reg[front[(rnd()*front.length)|0]]=g;left--;
  }
  return reg;
}

function neighborsOf(i,n){const r=(i/n)|0,c=i%n,o=[];if(r>0)o.push(i-n);if(r<n-1)o.push(i+n);if(c>0)o.push(i-1);if(c<n-1)o.push(i+1);return o}

function connected(reg,n,g,skip){
  const cells=[];for(let i=0;i<n*n;i++)if(reg[i]===g&&i!==skip)cells.push(i);
  if(!cells.length)return false;
  const seen=new Set([cells[0]]),st=[cells[0]];
  while(st.length){const i=st.pop();for(const j of neighborsOf(i,n))if(j!==skip&&reg[j]===g&&!seen.has(j)){seen.add(j);st.push(j)}}
  return seen.size===cells.length;
}

function generate(n,rnd){
  for(let attempt=0;attempt<400;attempt++){
    const sol=randomQueens(n,rnd);
    const reg=growRegions(n,sol,rnd);
    const queenCell=new Set(sol.map((c,r)=>r*n+c));
    // local repair: move cells that enable alternative solutions
    for(let step=0;step<60;step++){
      const out={};
      const k=countSolutions(reg,n,2,out);
      if(k===1)return{n,reg:Array.from(reg),sol};
      // find a cell used by the alt solution that's not a real queen, push it into a neighbour region
      const alt=out.first.join()===sol.join()?out.second:out.first;
      const cand=[];
      for(let r=0;r<n;r++){const i=r*n+alt[r];if(!queenCell.has(i))cand.push(i)}
      let moved=false;
      cand.sort(()=>rnd()-.5);
      for(const i of cand){
        const g=reg[i];
        const nb=neighborsOf(i,n).map(j=>reg[j]).filter(x=>x!==g);
        if(!nb.length)continue;
        if(!connected(reg,n,g,i))continue;
        reg[i]=nb[(rnd()*nb.length)|0];moved=true;break;
      }
      if(!moved)break;
    }
  }
  return null;
}

