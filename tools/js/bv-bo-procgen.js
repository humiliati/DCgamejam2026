// ═══════════════════════════════════════════════════════════════
//  tools/js/bv-bo-procgen.js — Pass 6: BO procgen action (browser)
// ═══════════════════════════════════════════════════════════════
// Registers the `procgen` BO action in the blockout visualizer.
// This is the browser-side counterpart to tools/cli/commands-procgen.js.
//
// Usage (via BO.run):
//   BO.run({ action: 'procgen', recipe: { ... }, seed: 42 })
//   BO.run({ action: 'procgen', recipe: { ... }, floorId: '3.1' })
//   BO.run({ action: 'listRecipes' })
//
// The procgen action generates a floor from a recipe and optionally
// injects it into the editor. Without floorId, returns a preview.
// With floorId, creates the floor via createFloor + paints the grid.
//
// The generator is embedded (no require()). It mirrors procgen.js
// but runs entirely in the browser.
// ═══════════════════════════════════════════════════════════════
(function () {
  'use strict';

  if (typeof window === 'undefined' || !window.BO || !window.BO._register) return;

  var BO = window.BO;
  var H  = BO._helpers || {};

  // ── Seeded RNG (xorshift32) ──────────────────────────────────
  function RNG(seed) {
    this._state = (seed || (Date.now() ^ (Math.random() * 0xFFFFFFFF))) >>> 0;
    if (this._state === 0) this._state = 1;
  }
  RNG.prototype.next = function () {
    var s = this._state;
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    this._state = s >>> 0;
    return this._state / 0x100000000;
  };
  RNG.prototype.intBetween = function (lo, hi) {
    return lo + Math.floor(this.next() * (hi - lo + 1));
  };
  RNG.prototype.pick = function (arr) {
    return arr[Math.floor(this.next() * arr.length)];
  };
  RNG.prototype.shuffle = function (arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(this.next() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  };

  // ── Tile resolution (from TILE_SCHEMA global) ────────────────
  var _schemaCache = null;
  function _getSchema() {
    if (_schemaCache) return _schemaCache;
    // blockout-visualizer loads TILE_SCHEMA at boot
    if (typeof TILE_SCHEMA !== 'undefined') {
      _schemaCache = TILE_SCHEMA;
    } else if (H.getTileSchema) {
      _schemaCache = H.getTileSchema();
    }
    return _schemaCache;
  }
  function _resolveTile(name) {
    var schema = _getSchema();
    if (!schema) return null;
    var tiles = schema.tiles || schema;
    var keys = Object.keys(tiles);
    for (var i = 0; i < keys.length; i++) {
      if (tiles[keys[i]].name === name) return tiles[keys[i]].id;
    }
    return null;
  }

  // ── Biome map (from BIOME_MAP global) ────────────────────────
  var _biomeCache = null;
  function _getBiomeMap() {
    if (_biomeCache) return _biomeCache;
    if (typeof BIOME_MAP !== 'undefined') {
      _biomeCache = BIOME_MAP;
    } else if (H.getBiomeMap) {
      _biomeCache = H.getBiomeMap();
    }
    return _biomeCache;
  }

  // ── Grid helpers ─────────────────────────────────────────────
  function _makeGrid(w, h, tile) {
    var g = [];
    for (var y = 0; y < h; y++) {
      var r = [];
      for (var x = 0; x < w; x++) r.push(tile);
      g.push(r);
    }
    return g;
  }
  function _fillRect(g, x, y, w, h, t) {
    for (var dy = 0; dy < h; dy++) for (var dx = 0; dx < w; dx++) {
      var gy = y + dy, gx = x + dx;
      if (gy >= 0 && gy < g.length && gx >= 0 && gx < g[0].length) g[gy][gx] = t;
    }
  }
  function _set(g, x, y, t) {
    if (y >= 0 && y < g.length && x >= 0 && x < g[0].length) g[y][x] = t;
  }
  function _get(g, x, y) {
    if (y >= 0 && y < g.length && x >= 0 && x < g[0].length) return g[y][x];
    return -1;
  }

  // ── BSP ──────────────────────────────────────────────────────
  function _bspSplit(n, rng, mW, mH, d, mD) {
    if (d >= mD) return;
    if (n.w < mW * 2 + 3 && n.h < mH * 2 + 3) return;
    var h;
    if (n.w < mW * 2 + 3) h = true;
    else if (n.h < mH * 2 + 3) h = false;
    else h = rng.next() < 0.5;
    if (h) {
      var minY = n.y + mH + 1, maxY = n.y + n.h - mH - 2;
      if (minY > maxY) return;
      var sy = rng.intBetween(minY, maxY);
      n.left  = { x: n.x, y: n.y,  w: n.w, h: sy - n.y };
      n.right = { x: n.x, y: sy,   w: n.w, h: n.y + n.h - sy };
    } else {
      var minX = n.x + mW + 1, maxX = n.x + n.w - mW - 2;
      if (minX > maxX) return;
      var sx = rng.intBetween(minX, maxX);
      n.left  = { x: n.x, y: n.y, w: sx - n.x,          h: n.h };
      n.right = { x: sx,  y: n.y, w: n.x + n.w - sx,    h: n.h };
    }
    _bspSplit(n.left,  rng, mW, mH, d + 1, mD);
    _bspSplit(n.right, rng, mW, mH, d + 1, mD);
  }
  function _leaves(n) {
    if (!n.left && !n.right) return [n];
    var o = [];
    if (n.left)  o = o.concat(_leaves(n.left));
    if (n.right) o = o.concat(_leaves(n.right));
    return o;
  }
  function _carveRoom(lf, rng, mnW, mnH, mxW, mxH) {
    var rw = rng.intBetween(Math.max(mnW, 3), Math.min(mxW, lf.w - 2));
    var rh = rng.intBetween(Math.max(mnH, 3), Math.min(mxH, lf.h - 2));
    var rx = rng.intBetween(lf.x + 1, lf.x + lf.w - rw - 1);
    var ry = rng.intBetween(lf.y + 1, lf.y + lf.h - rh - 1);
    lf.room = { x: rx, y: ry, w: rw, h: rh };
    return lf.room;
  }

  // ── Corridors ────────────────────────────────────────────────
  function _rc(r) { return { x: Math.floor(r.x + r.w / 2), y: Math.floor(r.y + r.h / 2) }; }

  function _carveStraight(g, x1, y1, x2, y2, ft, w) {
    var c = [];
    var sx = Math.min(x1, x2), ex = Math.max(x1, x2);
    for (var x = sx; x <= ex; x++) for (var dw = 0; dw < w; dw++) { _set(g, x, y1+dw, ft); c.push({x:x,y:y1+dw}); }
    var sy = Math.min(y1, y2), ey = Math.max(y1, y2);
    for (var y = sy; y <= ey; y++) for (var dw2 = 0; dw2 < w; dw2++) { _set(g, x2+dw2, y, ft); c.push({x:x2+dw2,y:y}); }
    return c;
  }
  function _carveWinding(g, x1, y1, x2, y2, ft, w, rng) {
    var c = [];
    var mY = rng.intBetween(Math.min(y1,y2), Math.max(y1,y2));
    var mX = rng.intBetween(Math.min(x1,x2), Math.max(x1,x2));
    var sx,ex,sy,ey;
    sx=Math.min(x1,mX); ex=Math.max(x1,mX);
    for(var x=sx;x<=ex;x++) for(var d=0;d<w;d++){_set(g,x,y1+d,ft);c.push({x:x,y:y1+d});}
    sy=Math.min(y1,mY); ey=Math.max(y1,mY);
    for(var y=sy;y<=ey;y++) for(var d2=0;d2<w;d2++){_set(g,mX+d2,y,ft);c.push({x:mX+d2,y:y});}
    sx=Math.min(mX,x2); ex=Math.max(mX,x2);
    for(var x2a=sx;x2a<=ex;x2a++) for(var d3=0;d3<w;d3++){_set(g,x2a,mY+d3,ft);c.push({x:x2a,y:mY+d3});}
    sy=Math.min(mY,y2); ey=Math.max(mY,y2);
    for(var y2a=sy;y2a<=ey;y2a++) for(var d4=0;d4<w;d4++){_set(g,x2+d4,y2a,ft);c.push({x:x2+d4,y:y2a});}
    return c;
  }
  function _carveLBend(g, x1, y1, x2, y2, ft, w, rng) {
    var c = [];
    if (rng.next() < 0.5) {
      var sx=Math.min(x1,x2),ex=Math.max(x1,x2);
      for(var x=sx;x<=ex;x++) for(var d=0;d<w;d++){_set(g,x,y1+d,ft);c.push({x:x,y:y1+d});}
      var sy=Math.min(y1,y2),ey=Math.max(y1,y2);
      for(var y=sy;y<=ey;y++) for(var d2=0;d2<w;d2++){_set(g,x2+d2,y,ft);c.push({x:x2+d2,y:y});}
    } else {
      var sy2=Math.min(y1,y2),ey2=Math.max(y1,y2);
      for(var y3=sy2;y3<=ey2;y3++) for(var d3=0;d3<w;d3++){_set(g,x1+d3,y3,ft);c.push({x:x1+d3,y:y3});}
      var sx2=Math.min(x1,x2),ex2=Math.max(x1,x2);
      for(var x3=sx2;x3<=ex2;x3++) for(var d4=0;d4<w;d4++){_set(g,x3,y2+d4,ft);c.push({x:x3,y:y2+d4});}
    }
    return c;
  }
  function _carveCorridor(g, x1, y1, x2, y2, ft, style, w, rng) {
    var s = style === 'random' ? rng.pick(['straight','winding','l-bend']) : style;
    if (s === 'winding') return _carveWinding(g,x1,y1,x2,y2,ft,w,rng);
    if (s === 'l-bend')  return _carveLBend(g,x1,y1,x2,y2,ft,w,rng);
    return _carveStraight(g,x1,y1,x2,y2,ft,w);
  }

  // ── MST ──────────────────────────────────────────────────────
  function _connectMST(rooms, g, ft, style, w, rng) {
    if (rooms.length < 2) return [];
    var cc = [], conn = [0], rem = [];
    for (var i=1;i<rooms.length;i++) rem.push(i);
    while (rem.length) {
      var bd=Infinity,bc=-1,br=-1;
      for(var ci=0;ci<conn.length;ci++) for(var ri=0;ri<rem.length;ri++){
        var a=_rc(rooms[conn[ci]]),b=_rc(rooms[rem[ri]]);
        var d=Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
        if(d<bd){bd=d;bc=conn[ci];br=ri;}
      }
      var ti=rem.splice(br,1)[0]; conn.push(ti);
      var ca=_rc(rooms[bc]),cb=_rc(rooms[ti]);
      cc=cc.concat(_carveCorridor(g,ca.x,ca.y,cb.x,cb.y,ft,style,w,rng));
    }
    return cc;
  }

  // ── Extra connections ────────────────────────────────────────
  function _addExtra(rooms, g, ft, style, w, frac, rng) {
    var cc = [];
    if (rooms.length < 3 || frac <= 0) return cc;
    var pairs = [];
    for(var i=0;i<rooms.length;i++) for(var j=i+2;j<rooms.length;j++){
      var a=_rc(rooms[i]),b=_rc(rooms[j]);
      pairs.push({i:i,j:j,d:Math.abs(a.x-b.x)+Math.abs(a.y-b.y)});
    }
    pairs.sort(function(a,b){return a.d-b.d;});
    var cnt=Math.max(1,Math.round(pairs.length*frac));
    for(var k=0;k<cnt&&k<pairs.length;k++){
      var pa=_rc(rooms[pairs[k].i]),pb=_rc(rooms[pairs[k].j]);
      cc=cc.concat(_carveCorridor(g,pa.x,pa.y,pb.x,pb.y,ft,style,w,rng));
    }
    return cc;
  }

  // ── Strategy decorators (same logic as procgen.js) ───────────
  function _cobwebStrat(g,rooms,cc,ft,wt,weight,rng){
    var W=g[0].length,H=g.length,bc=Math.round(rooms.length*2*weight);
    for(var b=0;b<bc;b++){
      if(!cc.length)break;
      var cell=rng.pick(cc);
      var dirs=rng.shuffle([{dx:1,dy:0},{dx:-1,dy:0},{dx:0,dy:1},{dx:0,dy:-1}]);
      for(var d=0;d<dirs.length;d++){
        var len=rng.intBetween(3,6),ok=true,br=[];
        for(var s=1;s<=len;s++){
          var nx=cell.x+dirs[d].dx*s,ny=cell.y+dirs[d].dy*s;
          if(nx<=0||nx>=W-1||ny<=0||ny>=H-1){ok=false;break;}
          if(_get(g,nx,ny)!==wt){ok=false;break;}
          var px=nx+dirs[d].dy,py=ny+dirs[d].dx;
          var qx=nx-dirs[d].dy,qy=ny-dirs[d].dx;
          if(_get(g,px,py)===ft&&s>1){ok=false;break;}
          if(_get(g,qx,qy)===ft&&s>1){ok=false;break;}
          br.push({x:nx,y:ny});
        }
        if(ok&&br.length>=3){for(var k=0;k<br.length;k++){_set(g,br[k].x,br[k].y,ft);cc.push(br[k]);}break;}
      }
    }
  }
  function _pwStrat(g,rooms,cc,ft,wt,weight,rng){
    var lc=Math.round(rooms.length*1.5*weight);
    for(var l=0;l<lc;l++){
      if(cc.length<10)break;
      var a=rng.pick(cc),best=null,bd=Infinity;
      for(var t=0;t<20;t++){
        var b=rng.pick(cc),m=Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
        if(m>=3&&m<=8&&m<bd){best=b;bd=m;}
      }
      if(!best)continue;
      var cells=_carveWinding(g,a.x,a.y,best.x,best.y,ft,1,rng);
      for(var c=0;c<cells.length;c++)cc.push(cells[c]);
    }
  }
  function _combatStrat(g,rooms,cc,ft,wt,weight,rng){
    for(var i=0;i<rooms.length;i++){
      var room=rooms[i];
      if(rng.next()<weight*0.6){
        var dir=rng.intBetween(0,3);
        var exps=[
          {fx:room.x-1,fy:room.y,fw:1,fh:room.h,adj:function(r){r.x--;r.w++;}},
          {fx:room.x+room.w,fy:room.y,fw:1,fh:room.h,adj:function(r){r.w++;}},
          {fx:room.x,fy:room.y-1,fw:room.w,fh:1,adj:function(r){r.y--;r.h++;}},
          {fx:room.x,fy:room.y+room.h,fw:room.w,fh:1,adj:function(r){r.h++;}}
        ];
        var e=exps[dir];
        if(e.fx>0&&e.fy>0&&e.fx+e.fw<g[0].length-1&&e.fy+e.fh<g.length-1){
          _fillRect(g,e.fx,e.fy,e.fw,e.fh,ft);e.adj(room);
        }
      }
      if(rng.next()<weight*0.5){
        var ws=rng.intBetween(0,3),ax,ay;
        switch(ws){
          case 0:ax=room.x-2;ay=room.y+rng.intBetween(0,Math.max(0,room.h-2));break;
          case 1:ax=room.x+room.w;ay=room.y+rng.intBetween(0,Math.max(0,room.h-2));break;
          case 2:ax=room.x+rng.intBetween(0,Math.max(0,room.w-2));ay=room.y-2;break;
          default:ax=room.x+rng.intBetween(0,Math.max(0,room.w-2));ay=room.y+room.h;break;
        }
        if(ax>0&&ay>0&&ax+2<g[0].length-1&&ay+2<g.length-1){
          _fillRect(g,ax,ay,2,2,ft);
          var cx2=(ws===0)?room.x-1:(ws===1)?room.x+room.w-1:ax;
          var cy2=(ws===2)?room.y-1:(ws===3)?room.y+room.h-1:ay;
          _set(g,cx2,cy2,ft);
        }
      }
    }
  }

  // ── Fetch strategy (DOC-113 §6.2) ────────────────────────────
  // Tree-structured maze for timed sprint runs. Mirrors
  // _applyFetchStrategy in tools/procgen.js.
  function _fetchStrat(g,rooms,cc,ft,wt,weight,rng,recipe){
    var W=g[0].length,H=g.length;
    var entCfg=recipe.entities||{};
    // 1. Branch stubs (dead-end red herrings)
    var branchCount=Math.round(rooms.length*1.5*weight);
    var branchEndCells=[];
    for(var b=0;b<branchCount;b++){
      if(!cc.length)break;
      var cell=rng.pick(cc);
      var dirs=rng.shuffle([{dx:1,dy:0},{dx:-1,dy:0},{dx:0,dy:1},{dx:0,dy:-1}]);
      for(var d=0;d<dirs.length;d++){
        var len=rng.intBetween(3,6),ok=true,br=[];
        for(var s=1;s<=len;s++){
          var nx=cell.x+dirs[d].dx*s,ny=cell.y+dirs[d].dy*s;
          if(nx<=0||nx>=W-1||ny<=0||ny>=H-1){ok=false;break;}
          if(_get(g,nx,ny)!==wt){ok=false;break;}
          var px=nx+dirs[d].dy,py=ny+dirs[d].dx;
          var qx=nx-dirs[d].dy,qy=ny-dirs[d].dx;
          if(_get(g,px,py)===ft&&s>1){ok=false;break;}
          if(_get(g,qx,qy)===ft&&s>1){ok=false;break;}
          br.push({x:nx,y:ny});
        }
        if(ok&&br.length>=3){
          for(var k=0;k<br.length;k++){_set(g,br[k].x,br[k].y,ft);cc.push(br[k]);}
          branchEndCells.push(br[br.length-1]);
          break;
        }
      }
    }
    // 2. Build room adjacency graph
    var adj=[];
    for(var ri=0;ri<rooms.length;ri++)adj.push([]);
    for(var ai=0;ai<rooms.length;ai++){
      for(var bi=ai+1;bi<rooms.length;bi++){
        var connected=false;
        for(var ci=0;ci<cc.length&&!connected;ci++){
          var c=cc[ci];
          var nearA=(c.x>=rooms[ai].x-1&&c.x<=rooms[ai].x+rooms[ai].w&&
                     c.y>=rooms[ai].y-1&&c.y<=rooms[ai].y+rooms[ai].h);
          var nearB=(c.x>=rooms[bi].x-1&&c.x<=rooms[bi].x+rooms[bi].w&&
                     c.y>=rooms[bi].y-1&&c.y<=rooms[bi].y+rooms[bi].h);
          if(nearA&&nearB)connected=true;
        }
        if(!connected){
          var tA=false,tB=false;
          for(var cj=0;cj<cc.length;cj++){
            var ct=cc[cj];
            if(!tA&&ct.x>=rooms[ai].x-1&&ct.x<=rooms[ai].x+rooms[ai].w&&
               ct.y>=rooms[ai].y-1&&ct.y<=rooms[ai].y+rooms[ai].h)tA=true;
            if(!tB&&ct.x>=rooms[bi].x-1&&ct.x<=rooms[bi].x+rooms[bi].w&&
               ct.y>=rooms[bi].y-1&&ct.y<=rooms[bi].y+rooms[bi].h)tB=true;
          }
          var ca=_rc(rooms[ai]),cb=_rc(rooms[bi]);
          var md=Math.abs(ca.x-cb.x)+Math.abs(ca.y-cb.y);
          if(tA&&tB&&md<(W+H)/2)connected=true;
        }
        if(connected){adj[ai].push(bi);adj[bi].push(ai);}
      }
    }
    // 3. BFS from room 0
    var dist=[];
    for(var di=0;di<rooms.length;di++)dist.push(-1);
    dist[0]=0;var queue=[0],qi=0;
    while(qi<queue.length){
      var cur=queue[qi++],nbrs=adj[cur];
      for(var ni=0;ni<nbrs.length;ni++){
        if(dist[nbrs[ni]]===-1){dist[nbrs[ni]]=dist[cur]+1;queue.push(nbrs[ni]);}
      }
    }
    var farthestRoom=0,farthestDist=0;
    for(var fi=0;fi<rooms.length;fi++){
      if(dist[fi]>farthestDist){farthestDist=dist[fi];farthestRoom=fi;}
    }
    // BFS parent trace for critical path
    var par=[];
    for(var pi=0;pi<rooms.length;pi++)par.push(-1);
    var dist2=[];for(var d2=0;d2<rooms.length;d2++)dist2.push(-1);
    dist2[0]=0;var q2=[0],q2i=0;
    while(q2i<q2.length){
      var c2=q2[q2i++],nb2=adj[c2];
      for(var n2=0;n2<nb2.length;n2++){
        if(dist2[nb2[n2]]===-1){dist2[nb2[n2]]=dist2[c2]+1;par[nb2[n2]]=c2;q2.push(nb2[n2]);}
      }
    }
    var criticalPath={},tn=farthestRoom;
    while(tn!==-1){criticalPath[tn]=true;tn=par[tn];}
    // Secondary exit room (leaf, not on critical path)
    var secRoom=-1,secDist=0;
    for(var li=0;li<rooms.length;li++){
      if(criticalPath[li])continue;
      if(adj[li].length<=1&&dist[li]>secDist){secDist=dist[li];secRoom=li;}
    }
    if(secRoom===-1){
      for(var f2=0;f2<rooms.length;f2++){
        if(!criticalPath[f2]&&dist[f2]>secDist){secDist=dist[f2];secRoom=f2;}
      }
    }
    // 4. Store metadata
    g._fetchMeta={
      objectiveRoom:farthestRoom,
      objectiveCenter:_rc(rooms[farthestRoom]),
      secondaryExitRoom:secRoom,
      secondaryExitCenter:secRoom>=0?_rc(rooms[secRoom]):null,
      criticalPath:criticalPath,
      branchEndCells:branchEndCells,
      roomDistances:dist
    };
  }

  // ── Entity placement ─────────────────────────────────────────
  function _placeTorches(g,rooms,wt,tt,dens,rng){
    var placed=[];
    for(var i=0;i<rooms.length;i++){
      var r=rooms[i],perim=[];
      for(var x=r.x-1;x<=r.x+r.w;x++){
        if(_get(g,x,r.y-1)===wt)perim.push({x:x,y:r.y-1});
        if(_get(g,x,r.y+r.h)===wt)perim.push({x:x,y:r.y+r.h});
      }
      for(var y=r.y;y<r.y+r.h;y++){
        if(_get(g,r.x-1,y)===wt)perim.push({x:r.x-1,y:y});
        if(_get(g,r.x+r.w,y)===wt)perim.push({x:r.x+r.w,y:y});
      }
      rng.shuffle(perim);
      var cnt=Math.max(1,Math.round(perim.length*dens)),last=[];
      for(var j=0;j<perim.length&&last.length<cnt;j++){
        var p=perim[j],close=false;
        for(var k=0;k<last.length;k++){if(Math.abs(p.x-last[k].x)+Math.abs(p.y-last[k].y)<3){close=true;break;}}
        if(!close){_set(g,p.x,p.y,tt);last.push(p);placed.push(p);}
      }
    }
    return placed;
  }
  function _placeBreakables(g,rooms,ft,bSet,dens,rng){
    var placed=[],bIds=[];
    for(var b=0;b<bSet.length;b++){var t=_resolveTile(bSet[b]);if(t!==null)bIds.push(t);}
    if(!bIds.length)return placed;
    for(var i=0;i<rooms.length;i++){
      var r=rooms[i],cands=[];
      for(var y=r.y;y<r.y+r.h;y++)for(var x=r.x;x<r.x+r.w;x++)if(_get(g,x,y)===ft)cands.push({x:x,y:y});
      rng.shuffle(cands);
      var cnt=Math.max(0,Math.round(cands.length*dens));
      for(var j=0;j<cnt&&j<cands.length;j++){var t2=rng.pick(bIds);_set(g,cands[j].x,cands[j].y,t2);placed.push(cands[j]);}
    }
    return placed;
  }
  function _placeTraps(g,cc,ft,dens,rng){
    var placed=[],names=['TRAP_PRESSURE_PLATE','TRAP_TRIPWIRE','TRAP_TELEPORT_DISC'],ids=[];
    for(var i=0;i<names.length;i++){var t=_resolveTile(names[i]);if(t!==null)ids.push(t);}
    if(!ids.length||!cc.length)return placed;
    var elig=[];
    for(var c=0;c<cc.length;c++)if(_get(g,cc[c].x,cc[c].y)===ft)elig.push(cc[c]);
    rng.shuffle(elig);
    var cnt=Math.max(0,Math.round(elig.length*dens));
    for(var j=0;j<cnt&&j<elig.length;j++){var t2=rng.pick(ids);_set(g,elig[j].x,elig[j].y,t2);placed.push(elig[j]);}
    return placed;
  }
  function _placeChests(g,rooms,ft,mn,mx,rng){
    var ct=_resolveTile('CHEST');if(ct===null)return[];
    var placed=[],cnt=rng.intBetween(mn,mx),ri=[];
    for(var i=0;i<rooms.length;i++)ri.push(i);rng.shuffle(ri);
    for(var c=0;c<cnt&&c<ri.length;c++){
      var r=rooms[ri[c]],wa=[];
      for(var y=r.y;y<r.y+r.h;y++)for(var x=r.x;x<r.x+r.w;x++){
        if(_get(g,x,y)!==ft)continue;
        var adj=[_get(g,x-1,y),_get(g,x+1,y),_get(g,x,y-1),_get(g,x,y+1)];
        for(var a=0;a<adj.length;a++)if(adj[a]!==ft&&adj[a]!==-1){wa.push({x:x,y:y});break;}
      }
      if(wa.length){var s=rng.pick(wa);_set(g,s.x,s.y,ct);placed.push(s);}
    }
    return placed;
  }
  function _placeCorpses(g,rooms,ft,mn,mx,rng){
    var ct=_resolveTile('CORPSE');if(ct===null)return[];
    var placed=[],cnt=rng.intBetween(mn,mx),af=[];
    for(var i=0;i<rooms.length;i++){var r=rooms[i];for(var y=r.y;y<r.y+r.h;y++)for(var x=r.x;x<r.x+r.w;x++)if(_get(g,x,y)===ft)af.push({x:x,y:y});}
    rng.shuffle(af);
    for(var j=0;j<cnt&&j<af.length;j++){_set(g,af[j].x,af[j].y,ct);placed.push(af[j]);}
    return placed;
  }
  function _genEnemies(rooms,ft,g,mn,mx,rng){
    var spawns=[],cnt=rng.intBetween(mn,mx),ri=[];
    for(var i=0;i<rooms.length;i++)ri.push(i);rng.shuffle(ri);
    for(var e=0;e<cnt;e++){
      var r=rooms[ri[e%ri.length]];
      var cx=rng.intBetween(r.x+1,r.x+r.w-2),cy=rng.intBetween(r.y+1,r.y+r.h-2);
      if(_get(g,cx,cy)===ft)spawns.push({x:cx,y:cy,kind:'ENEMY'});
    }
    return spawns;
  }

  // ── Door helpers ─────────────────────────────────────────────
  function _findWallSlot(g,wall,ft,wt){
    var W=g[0].length,H=g.length,c=[];
    switch(wall){
      case'north':for(var x=1;x<W-1;x++)if(_get(g,x,0)===wt&&_get(g,x,1)===ft)c.push({x:x,y:0});break;
      case'south':for(var x2=1;x2<W-1;x2++)if(_get(g,x2,H-1)===wt&&_get(g,x2,H-2)===ft)c.push({x:x2,y:H-1});break;
      case'west':for(var y=1;y<H-1;y++)if(_get(g,0,y)===wt&&_get(g,1,y)===ft)c.push({x:0,y:y});break;
      case'east':for(var y2=1;y2<H-1;y2++)if(_get(g,W-1,y2)===wt&&_get(g,W-2,y2)===ft)c.push({x:W-1,y:y2});break;
    }
    return c.length?c[Math.floor(c.length/2)]:null;
  }
  function _ensurePath(g,dp,ft,wt){
    var W=g[0].length,H=g.length,dx=0,dy=0;
    if(dp.y===0)dy=1;if(dp.y===H-1)dy=-1;if(dp.x===0)dx=1;if(dp.x===W-1)dx=-1;
    var cx=dp.x+dx,cy=dp.y+dy;
    for(var s=0;s<Math.max(W,H);s++){
      if(cx<=0||cx>=W-1||cy<=0||cy>=H-1)break;
      if(_get(g,cx,cy)===ft)break;
      _set(g,cx,cy,ft);cx+=dx;cy+=dy;
    }
  }
  function _resolveWall(p,rng){return p==='auto'?rng.pick(['north','south','east','west']):p;}
  function _opposite(w){return{north:'south',south:'north',east:'west',west:'east'}[w]||'south';}

  // ═══════════════════════════════════════════════════════════════
  //  GENERATE (browser mirror of procgen.js generate())
  // ═══════════════════════════════════════════════════════════════
  function _generate(recipe, opts) {
    opts = opts || {};
    var seed = (opts.seed != null) ? opts.seed : recipe.seed;
    var rng = new RNG(seed);

    var biomeMap = _getBiomeMap();
    if (!biomeMap || !biomeMap.biomes) throw new Error('biome map not loaded');
    var biome = biomeMap.biomes[recipe.biome];
    if (!biome) throw new Error('unknown biome: ' + recipe.biome);

    var wallTile  = _resolveTile(biome.wallTile);
    var floorTile = _resolveTile(biome.floorTile);
    var torchTile = _resolveTile(biome.torchTile);
    if (wallTile === null) throw new Error('cannot resolve wallTile');
    if (floorTile === null) throw new Error('cannot resolve floorTile');

    var W = recipe.size.width, H = recipe.size.height;
    var rmCfg = recipe.rooms || {};
    var rmCnt = rmCfg.count || [3,7];
    var rmMin = rmCfg.minSize || [3,3];
    var rmMax = rmCfg.maxSize || [9,9];
    var coCfg = recipe.corridors || {};
    var coStyle = coCfg.style || 'random';
    var coWidth = coCfg.width || 1;
    var coExtra = coCfg.extraConnections != null ? coCfg.extraConnections : 0.2;
    var enCfg = recipe.entities || {};
    var strategy = recipe.strategy || { primary: 'mixed', weight: 1.0 };
    var sw = strategy.weight != null ? strategy.weight : 1.0;
    var drCfg = recipe.doors || {};

    var grid = _makeGrid(W, H, wallTile);
    var target = rng.intBetween(rmCnt[0], rmCnt[1]);
    var mD = Math.max(2, Math.ceil(Math.log(target) / Math.log(2)) + 1);
    var root = { x: 0, y: 0, w: W, h: H };
    _bspSplit(root, rng, rmMin[0]+2, rmMin[1]+2, 0, mD);
    var lvs = _leaves(root); rng.shuffle(lvs);
    if (lvs.length > target) lvs = lvs.slice(0, target);
    var rooms = [];
    for (var i = 0; i < lvs.length; i++) {
      var rm = _carveRoom(lvs[i], rng, rmMin[0], rmMin[1], rmMax[0], rmMax[1]);
      _fillRect(grid, rm.x, rm.y, rm.w, rm.h, floorTile);
      rooms.push(rm);
    }
    var cc = _connectMST(rooms, grid, floorTile, coStyle, coWidth, rng);
    cc = cc.concat(_addExtra(rooms, grid, floorTile, coStyle, coWidth, coExtra, rng));

    switch (strategy.primary) {
      case 'cobweb': _cobwebStrat(grid,rooms,cc,floorTile,wallTile,sw,rng); break;
      case 'pressure-wash': _pwStrat(grid,rooms,cc,floorTile,wallTile,sw,rng); break;
      case 'combat': _combatStrat(grid,rooms,cc,floorTile,wallTile,sw,rng); break;
      case 'fetch': _fetchStrat(grid,rooms,cc,floorTile,wallTile,sw,rng,recipe); break;
      case 'mixed':
        var w3=sw/3;
        _cobwebStrat(grid,rooms,cc,floorTile,wallTile,w3,rng);
        _pwStrat(grid,rooms,cc,floorTile,wallTile,w3,rng);
        _combatStrat(grid,rooms,cc,floorTile,wallTile,w3,rng);
        break;
    }

    var entryWall = _resolveWall(drCfg.entry || 'auto', rng);
    var exitWall  = drCfg.exit || 'auto';
    if (exitWall === 'auto') exitWall = _opposite(entryWall);
    var depth = biome.depth || 3;
    var entryName = (depth >= 3) ? 'STAIRS_UP' : 'DOOR_EXIT';
    var exitName  = drCfg.bossGate ? 'BOSS_DOOR' : ((depth >= 3) ? 'STAIRS_DN' : 'DOOR');
    var entryTile = _resolveTile(entryName);
    var exitTile  = (exitWall !== 'none') ? _resolveTile(exitName) : null;
    var entryPos = _findWallSlot(grid, entryWall, floorTile, wallTile);
    if (!entryPos) entryPos = { x: Math.floor(W/2), y: (entryWall==='north')?0:H-1 };
    _set(grid, entryPos.x, entryPos.y, entryTile);
    _ensurePath(grid, entryPos, floorTile, wallTile);
    var exitPos = null, doorPos = [entryPos];
    if (exitTile && exitWall !== 'none') {
      exitPos = _findWallSlot(grid, exitWall, floorTile, wallTile);
      if (!exitPos) exitPos = { x: Math.floor(W/2), y: (exitWall==='south')?H-1:0 };
      _set(grid, exitPos.x, exitPos.y, exitTile);
      _ensurePath(grid, exitPos, floorTile, wallTile);
      doorPos.push(exitPos);
    }

    var spX=entryPos.x,spY=entryPos.y,spD=1;
    switch(entryWall){
      case'north':spY=entryPos.y+1;spD=1;break;
      case'south':spY=entryPos.y-1;spD=3;break;
      case'west':spX=entryPos.x+1;spD=0;break;
      case'east':spX=entryPos.x-1;spD=2;break;
    }
    if(_get(grid,spX,spY)!==floorTile)_set(grid,spX,spY,floorTile);
    var spawn={x:spX,y:spY,dir:spD};

    var td=enCfg.torchDensity!=null?enCfg.torchDensity:0.3;
    var bd=enCfg.breakableDensity!=null?enCfg.breakableDensity:0.15;
    var trd=enCfg.trapDensity!=null?enCfg.trapDensity:0.05;
    var chR=enCfg.chestCount||[1,3];
    var coR=enCfg.corpseCount||[0,2];
    var enR=enCfg.enemyBudget||[2,6];

    var torches=_placeTorches(grid,rooms,wallTile,torchTile,td,rng);
    var breakables=_placeBreakables(grid,rooms,floorTile,biome.breakableSet||[],bd,rng);
    var traps=_placeTraps(grid,cc,floorTile,trd,rng);
    var chests=_placeChests(grid,rooms,floorTile,chR[0],chR[1],rng);
    var corpses=_placeCorpses(grid,rooms,floorTile,coR[0],coR[1],rng);
    var enemies=_genEnemies(rooms,floorTile,grid,enR[0],enR[1],rng);

    // ── Fetch-specific entities (DOC-113 §6.2) ────────────────
    var fetchMeta=grid._fetchMeta||null;
    var decoys=[],secondaryExitPos=null,objectivePos=null;
    if(fetchMeta&&strategy.primary==='fetch'){
      objectivePos=fetchMeta.objectiveCenter;
      // Place decoy containers in branch stub ends
      var decoyRange=enCfg.decoyCount||[1,3];
      var decoyCount=rng.intBetween(decoyRange[0],decoyRange[1]);
      var branchEnds=rng.shuffle(fetchMeta.branchEndCells.slice());
      for(var dec=0;dec<decoyCount&&dec<branchEnds.length;dec++){
        var dpos=branchEnds[dec];
        if(_get(grid,dpos.x,dpos.y)===floorTile){
          var chestTile2=_resolveTile('CHEST');
          if(chestTile2!=null){_set(grid,dpos.x,dpos.y,chestTile2);decoys.push({x:dpos.x,y:dpos.y,kind:'decoy_chest'});}
        }
      }
      // Place secondary exit
      var wantSecExit=enCfg.secondaryExit!==false;
      if(wantSecExit&&fetchMeta.secondaryExitRoom>=0&&fetchMeta.secondaryExitCenter){
        var secRm=rooms[fetchMeta.secondaryExitRoom];
        var secCands=[];
        for(var sy=secRm.y;sy<secRm.y+secRm.h;sy++){
          for(var sx=secRm.x;sx<secRm.x+secRm.w;sx++){
            if(sx<=1||sx>=W-2||sy<=1||sy>=H-2)secCands.push({x:sx,y:sy});
          }
        }
        secondaryExitPos=secCands.length?rng.pick(secCands):fetchMeta.secondaryExitCenter;
        if(secondaryExitPos){var deT=_resolveTile('DOOR_EXIT');if(deT!=null)_set(grid,secondaryExitPos.x,secondaryExitPos.y,deT);}
      }
      delete grid._fetchMeta;
    }

    var dt={};
    dt[entryPos.x+','+entryPos.y]='__parent__';
    if(exitPos)dt[exitPos.x+','+exitPos.y]='__child__';
    if(secondaryExitPos)dt[secondaryExitPos.x+','+secondaryExitPos.y]='__parent__';

    var doors=[
      {x:entryPos.x,y:entryPos.y,key:'entry',kind:entryName,target:'__parent__'},
      exitPos?{x:exitPos.x,y:exitPos.y,key:'exit',kind:exitName,target:'__child__'}:null
    ].filter(Boolean);
    if(secondaryExitPos)doors.push({x:secondaryExitPos.x,y:secondaryExitPos.y,key:'secondary_exit',kind:'DOOR_EXIT',target:'__parent__'});

    var resultObj={
      grid:grid,gridW:W,gridH:H,spawn:spawn,doorTargets:dt,
      biome:recipe.biome,
      doors:doors,
      entities:enemies,
      rooms:rooms.map(function(r){return{x:r.x,y:r.y,w:r.w,h:r.h};}),
      meta:{
        recipe:recipe.id,seed:seed,strategy:strategy.primary,
        faction:recipe.faction||'neutral',
        stats:{roomCount:rooms.length,corridorCells:cc.length,torches:torches.length,
               breakables:breakables.length,traps:traps.length,chests:chests.length,
               corpses:corpses.length,enemySpawns:enemies.length,
               decoys:decoys.length,hasSecondaryExit:!!secondaryExitPos,hasObjective:!!objectivePos}
      }
    };
    if(objectivePos)resultObj.meta.fetchObjective={x:objectivePos.x,y:objectivePos.y};
    if(secondaryExitPos)resultObj.meta.secondaryExit={x:secondaryExitPos.x,y:secondaryExitPos.y};
    return resultObj;
  }

  // ═══════════════════════════════════════════════════════════════
  //  BO ACTIONS
  // ═══════════════════════════════════════════════════════════════

  BO._register('procgen', function (params) {
    if (!params || !params.recipe) return { error: 'recipe object required' };
    var recipe = params.recipe;
    var result = _generate(recipe, { seed: params.seed });

    if (!params.floorId) {
      // Preview mode — return the result without modifying editor state
      return { ok: true, preview: true, result: result };
    }

    // Inject mode — create or overwrite the floor in the editor
    var floorId = params.floorId;
    try {
      // Try createFloor first (if floor doesn't exist)
      var createResult = BO.run({
        action: 'createFloor',
        id: floorId,
        biome: recipe.biome,
        width: result.gridW,
        height: result.gridH
      });

      // Paint the entire grid
      for (var y = 0; y < result.gridH; y++) {
        for (var x = 0; x < result.gridW; x++) {
          BO.run({ action: 'paint', floorId: floorId, x: x, y: y, tile: result.grid[y][x] });
        }
      }

      // Set spawn
      BO.run({ action: 'setSpawn', floorId: floorId, x: result.spawn.x, y: result.spawn.y, dir: result.spawn.dir });

      // Set door targets
      var dtKeys = Object.keys(result.doorTargets);
      for (var d = 0; d < dtKeys.length; d++) {
        var parts = dtKeys[d].split(',');
        BO.run({ action: 'setDoorTarget', floorId: floorId, key: dtKeys[d], target: result.doorTargets[dtKeys[d]] });
      }

      return {
        ok: true,
        floorId: floorId,
        biome: recipe.biome,
        strategy: result.meta.strategy,
        gridSize: result.gridW + 'x' + result.gridH,
        stats: result.meta.stats,
        seed: result.meta.seed
      };
    } catch (e) {
      return { error: String(e.message || e), partial: true };
    }
  });

  BO._register('listRecipes', function () {
    // In browser, recipes are loaded via fetch. Return the known built-in set.
    return {
      note: 'Browser-side recipe listing is static. Use CLI `bo list-recipes` for dynamic discovery.',
      builtIn: [
        { id: 'cobweb-cellar',         title: 'Cobweb Cellar',         biome: 'cellar',   strategy: 'cobweb' },
        { id: 'pressure-wash-catacomb', title: 'Pressure Wash Catacomb', biome: 'catacomb', strategy: 'pressure-wash' },
        { id: 'combat-depths',         title: 'Combat Depths Arena',   biome: 'depths',   strategy: 'combat' },
        { id: 'sprint-cellar',         title: 'Sprint Cellar',         biome: 'cellar',   strategy: 'fetch' }
      ]
    };
  });

  // Expose generator for direct use
  BO._register('procgenPreview', function (params) {
    if (!params || !params.recipe) return { error: 'recipe object required' };
    return _generate(params.recipe, { seed: params.seed });
  });

  console.log('[bv-bo-procgen] registered: procgen, listRecipes, procgenPreview');
})();
