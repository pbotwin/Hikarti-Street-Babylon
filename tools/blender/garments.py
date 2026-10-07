"""Garments for the heroine (Hikari Mall's clothing store): hoodie,
sweatshirt, blouse, jeans and a pleated skirt, each a skinned mesh bound to
her VRM armature (same bone names), so the game binds them to her own
skeleton (src/player/Garments.js). Her tee, shorts and sneakers are her own
pieces, recoloured in the game.

Everything is made in her rest pose (T-pose; Blender space: metres, Z up,
-Y forward, +X her left), from her own body:
  1. The body as she wears it (skin, tee, shorts of the VRM's Body mesh)
     plus simple volumes that give a garment its cut (loose sleeves, a
     flare) become one signed distance field; the garment is its surface at
     an offset (the ease), closed morphologically so cloth bridges hollows
     instead of clinging. Nothing pokes through at rest by construction.
  2. Trimmed to its openings by planes, remeshed to even quads (QuadriFlow)
     at a phone budget, trimmed again so the openings are clean loops.
  3. Openings finished with bands lofted from their loops (ribbing, cuffs,
     collars); details (hood, pocket, drawstrings, placket, buttons,
     pockets, seams, pleats) built on the surface.
  4. Skin weights transferred from her body (nearest surface, interpolated),
     smoothed, at most 4 influences, normalised. The skirt is weighted by
     rule: hips at the waist, blending to the thighs toward the hem.
  5. Vertex colours carry soft occlusion and the fabric detail (rib stripes,
     seams); the game multiplies them by the item's colour.

blender -b -P tools/blender/garments.py
"""
import math
import os
import shutil
import sys
import tempfile

import bmesh
import bpy
from mathutils import Vector
from mathutils.geometry import convex_hull_2d
from mathutils.bvhtree import BVHTree

sys.path.insert(0, os.path.dirname(__file__))
from common import OUT, ROOT, mat, reset  # noqa: E402

VRM = os.path.join(ROOT, 'public', 'models', 'heroine.vrm')
# Field resolution: 5 mm keeps the folds of her tee without stair steps.
VOXEL = 0.005


# ---------------------------------------------------------------- her body
def import_heroine():
    """Her armature and Body mesh, imported from the game's VRM (a GLB)."""
    tmp = os.path.join(tempfile.gettempdir(), 'heroine_for_garments.glb')
    shutil.copyfile(VRM, tmp)
    bpy.ops.import_scene.gltf(filepath=tmp)
    os.remove(tmp)
    arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
    return arm, bpy.data.objects['Body']


def link(o):
    bpy.context.collection.objects.link(o)
    return o


def new_object(name, bm):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    return link(bpy.data.objects.new(name, me))


def body_region(body, keep, name):
    """A copy of her Body mesh with only the faces `keep(material name,
    centre)` accepts; vertex groups come along."""
    o = link(body.copy())
    o.data = body.data.copy()
    o.name = name
    o.modifiers.clear()
    names = [m.name for m in o.data.materials]
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if not keep(names[f.material_index], f.calc_center_median())], context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.to_mesh(o.data)
    bm.free()
    return o


def fold_spring_groups(o):
    """The tee's spring bones (hem, sleeves) only move her tee, which a
    garment hides: their weights go to the limb they hang from."""
    for g in list(o.vertex_groups):
        n = g.name
        if 'Tops' not in n:
            continue
        side = 'L' if '_L_' in n else 'R'
        target = f'J_Bip_{side}_UpperArm' if 'UpperArm' in n else f'J_Bip_{side}_UpperLeg'
        dst = o.vertex_groups[target]
        for v in o.data.vertices:
            for e in v.groups:
                if e.group == g.index and e.weight > 0:
                    dst.add([v.index], e.weight, 'ADD')
        o.vertex_groups.remove(g)


# ---------------------------------------------------------------- mesh helpers
def components(bm):
    seen, out = set(), []
    for v in bm.verts:
        if v in seen:
            continue
        stack, comp = [v], []
        seen.add(v)
        while stack:
            x = stack.pop()
            comp.append(x)
            for e in x.link_edges:
                y = e.other_vert(x)
                if y not in seen:
                    seen.add(y)
                    stack.append(y)
        out.append(comp)
    return out


def keep_largest(bm):
    comps = sorted(components(bm), key=len)
    for c in comps[:-1]:
        bmesh.ops.delete(bm, geom=c, context='VERTS')


def plane(co, no):
    """A cut: away with what lies beyond the plane (co, normal)."""
    no = Vector(no).normalized()

    def cut(bm, inset):
        geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
        bmesh.ops.bisect_plane(bm, geom=geom, dist=1e-6, plane_co=Vector(co) - no * inset, plane_no=no, clear_outer=True)
    return cut


def neckline(a, b, centre, floor=1.2):
    """A cut: the neck hole, an upright elliptic cylinder (semi-axes a
    across, b front to back) through the shoulder slopes above `floor`. A
    plane through the neck's base would graze the flaring slope and wander;
    the cylinder meets it cleanly. The hole's rim is snapped onto the
    ellipse so it is smooth."""
    cx, cy = centre

    def cut(bm, inset):
        ea, eb = a + inset, b + inset
        inside = lambda p: p.z > floor and ((p.x - cx) / ea) ** 2 + ((p.y - cy) / eb) ** 2 < 1
        rim = {v for f in bm.faces if inside(f.calc_center_median()) for v in f.verts}
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if inside(f.calc_center_median())], context='FACES')
        for v in rim:
            if v.is_valid and v.link_faces:
                dx, dy = v.co.x - cx, v.co.y - cy
                k = 1 / math.sqrt((dx / ea) ** 2 + (dy / eb) ** 2)
                v.co.x, v.co.y = cx + dx * k, cy + dy * k
    return cut


def trim(bm, cuts, inset=0.0):
    """Apply the cuts (each moved `inset` inward) and keep the main piece."""
    for cut in cuts:
        cut(bm, inset)
        bmesh.ops.delete(bm, geom=[e for e in bm.edges if not e.link_faces], context='EDGES')
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
        keep_largest(bm)


def boundary_loops(bm):
    """Ordered vertex loops along the open edges."""
    edges = [e for e in bm.edges if e.is_boundary]
    left, loops = set(edges), []
    while left:
        e = left.pop()
        loop = [e.verts[0], e.verts[1]]
        while True:
            nxt = next((x for x in loop[-1].link_edges if x in left), None)
            if not nxt:
                break
            left.discard(nxt)
            v = nxt.other_vert(loop[-1])
            if v is loop[0]:
                break
            loop.append(v)
        loops.append(loop)
    return loops


def bvh_of(*objs):
    bm = bmesh.new()
    for o in objs:
        tmp = bmesh.new()
        tmp.from_mesh(o.data)
        tmp.transform(o.matrix_world)
        me = bpy.data.meshes.new('tmp')
        tmp.to_mesh(me)
        tmp.free()
        bm.from_mesh(me)
        bpy.data.meshes.remove(me)
    tree = BVHTree.FromBMesh(bm)
    bm.free()
    return tree


# ---------------------------------------------------------------- shells
def cone(bm, a, b, ra, rb, seg=24):
    """Closed truncated cone from point a (radius ra) to b (rb)."""
    axis = (b - a).normalized()
    u = axis.orthogonal().normalized()
    w = axis.cross(u)
    rings = []
    for p, r in ((a, ra), (b, rb)):
        rings.append([bm.verts.new(p + (u * math.cos(t) + w * math.sin(t)) * r) for t in (i / seg * math.tau for i in range(seg))])
    for i in range(seg):
        j = (i + 1) % seg
        bm.faces.new((rings[0][i], rings[0][j], rings[1][j], rings[1][i]))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[1])


def field_surface(name, sources, offset, close):
    """Surface `offset` outside the union of the source meshes (her body and
    shaping volumes), morphologically closed by `close` (grown that much
    further, then shrunk back): gaps and hollows narrower than twice that
    are bridged, as cloth bridges them, and the surface has no pinholes or
    tunnels where her parts nearly touch."""
    src = bmesh.new()
    for o in sources:
        if isinstance(o, bmesh.types.BMesh):
            me = bpy.data.meshes.new('tmp')
            o.to_mesh(me)
        else:
            me = o.data
        src.from_mesh(me)
        if me.users == 0:
            bpy.data.meshes.remove(me)
    holder = new_object(name + '_src', src)
    out = link(bpy.data.objects.new(name, bpy.data.meshes.new(name)))
    ng = bpy.data.node_groups.new(name, 'GeometryNodeTree')
    ng.interface.new_socket('Geometry', in_out='OUTPUT', socket_type='NodeSocketGeometry')
    info = ng.nodes.new('GeometryNodeObjectInfo')
    info.inputs['Object'].default_value = holder
    sdf = ng.nodes.new('GeometryNodeMeshToSDFGrid')
    sdf.inputs['Voxel Size'].default_value = VOXEL
    sdf.inputs['Band Width'].default_value = int((offset + close) / VOXEL) + 6
    ng.links.new(info.outputs['Geometry'], sdf.inputs['Mesh'])
    grid = sdf.outputs['SDF Grid']
    for d in (offset + close, -close):
        f = ng.nodes.new('GeometryNodeSDFGridOffset')
        f.inputs['Distance'].default_value = d
        ng.links.new(grid, f.inputs['Grid'])
        grid = f.outputs['Grid']
    mesh = ng.nodes.new('GeometryNodeGridToMesh')
    mesh.inputs['Threshold'].default_value = 0.0
    ng.links.new(grid, mesh.inputs['Grid'])
    ng.links.new(mesh.outputs['Mesh'], ng.nodes.new('NodeGroupOutput').inputs[0])
    out.modifiers.new('field', 'NODES').node_group = ng
    bpy.context.view_layer.objects.active = out
    bpy.ops.object.modifier_apply(modifier='field')
    bpy.data.node_groups.remove(ng)
    bpy.data.objects.remove(holder)
    return out


def cap(bm):
    """Close every opening with a fan around its centre, wound like the
    cloth next to it (an ngon fill can fold over on a crooked rim)."""
    for loop in boundary_loops(bm):
        c = bm.verts.new(sum((v.co for v in loop), Vector()) / len(loop))
        for a, b in zip(loop, loop[1:] + loop[:1]):
            e = bm.edges.get((a, b))
            f = e.link_faces[0]
            vs = list(f.verts)
            forward = vs[(vs.index(a) + 1) % len(vs)] is b
            bm.faces.new((b, a, c) if forward else (a, b, c))


def shell(sources, offset, cuts, faces, close=0.01):
    """The garment's cloth: the field surface around `sources`, trimmed to
    its openings, capped, remeshed to even quads, then trimmed again just
    inside the old cuts so the caps go and the openings are clean loops.
    Returns a BMesh."""
    o = field_surface('shell', sources, offset, close)
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    keep_largest(bm)
    trim(bm, cuts)
    # QuadriFlow needs a clean closed manifold: no edge under 0.1 mm on any
    # axis (slivers from the cuts), no pinches (two sheets touching at a
    # vertex: opened up, then capped and remeshed like the openings).
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=2e-4)
    bmesh.ops.dissolve_degenerate(bm, edges=bm.edges, dist=2e-4)
    while True:
        pinched = {f for v in bm.verts if not v.is_manifold for f in v.link_faces}
        if not pinched:
            break
        bmesh.ops.delete(bm, geom=list(pinched), context='FACES')
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
        keep_largest(bm)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    cap(bm)
    bmesh.ops.triangulate(bm, faces=bm.faces)
    bm.to_mesh(o.data)
    bm.free()
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    # QuadriFlow refuses this mesh with mesh symmetry on, and now and then
    # fails on a seed: the next seed works.
    for seed in range(8):
        try:
            if 'FINISHED' in bpy.ops.object.quadriflow_remesh(target_faces=faces, mode='FACES', use_mesh_symmetry=False, seed=seed):
                break
        except RuntimeError:
            continue
    else:
        raise RuntimeError('QuadriFlow failed')
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bpy.data.meshes.remove(o.data)
    trim(bm, cuts, inset=0.006)
    bm.verts.layers.float.new('tone')
    tone = bm.verts.layers.float['tone']
    for v in bm.verts:
        v[tone] = 1.0
    return bm


# ---------------------------------------------------------------- pieces
# Every piece is added to the garment's BMesh with a per-vertex `tone` (the
# fabric detail, multiplied with the soft occlusion into vertex colours).
def tone_of(bm):
    return bm.verts.layers.float['tone']


def surface_tree(bm):
    return BVHTree.FromBMesh(bm)


def hit(tree, origin, direction):
    """Ray onto the cloth: (point, normal facing the ray's origin) or None."""
    loc, n, _, _ = tree.ray_cast(origin, direction, 2.0)
    if loc is None:
        return None
    return loc, (-n if n.dot(direction) > 0 else n)


def nearest(tree, p):
    loc, n, _, _ = tree.find_nearest(p)
    return loc, (n if n.dot(p - loc) >= 0 else -n)


def ring(loop, n, axis):
    """A boundary loop resampled to `n` evenly spaced points, turning
    counter-clockwise about `axis`; returns (points, centre)."""
    pts = [v.co.copy() for v in loop]
    c = sum(pts, Vector()) / len(pts)
    normal = Vector()
    for a, b in zip(pts, pts[1:] + pts[:1]):
        normal += (a - c).cross(b - c)
    if normal.dot(axis) < 0:
        pts.reverse()
    seg = [(a - b).length for a, b in zip(pts[1:] + pts[:1], pts)]
    total = sum(seg)
    out, i, acc = [], 0, 0.0
    for k in range(n):
        d = k / n * total
        while acc + seg[i] < d:
            acc += seg[i]
            i += 1
        t = (d - acc) / max(seg[i], 1e-9)
        out.append(pts[i].lerp(pts[(i + 1) % len(pts)], t))
    return out, c


def find_loop(bm, test):
    """The boundary loop whose centre passes `test`."""
    for loop in boundary_loops(bm):
        c = sum((v.co for v in loop), Vector()) / len(loop)
        if test(c):
            return loop
    raise ValueError('opening not found')


def grid_faces(bm, rows, closed=True):
    """Quads between consecutive rows of vertices."""
    faces = []
    for a, b in zip(rows, rows[1:]):
        n = len(a)
        for i in range(n if closed else n - 1):
            j = (i + 1) % n
            faces.append(bm.faces.new((a[i], a[j], b[j], b[i])))
    return faces


def face_toward(bm, faces, outward):
    """Turn a piece's faces so the first one faces `outward(face)`."""
    f = faces[0]
    f.normal_update()
    if f.normal.dot(outward(f)) < 0:
        bmesh.ops.reverse_faces(bm, faces=faces)


def band(bm, pts, c, axis, profile, ribs=False, tone=1.0):
    """A band lofted from an opening's ring (hem rib, cuff, neck band,
    collar stand): `profile` rows (t, scale, inward) place a copy of the ring
    t along `axis`, its radius scaled, `inward` metres in (the turned-in lip
    that gives the edge its thickness). The first rows tuck inside the cloth
    so the seam never shows a gap. `ribs`: alternate columns shaded (knit
    ribbing)."""
    tl = tone_of(bm)
    rows = []
    for t, s, inward in profile:
        row = []
        for i, p in enumerate(pts):
            r = p - c
            v = bm.verts.new(c + r * (s * (1 - inward / max(r.length, 1e-6))) + axis * t)
            v[tl] = tone * (0.78 if inward else 0.86 if ribs and i % 2 else 1.0)
            row.append(v)
        rows.append(row)
    grid_faces(bm, rows)
    return rows


def lip(t, s, depth=0.012, thick=0.003):
    """Profile rows for a band's turned-in edge at t."""
    return [(t, s, thick), (t - depth, s, thick)]


def patch(bm, tree, nu, nv, at, direction, lift, tone=lambda u, v: 1.0, sink=0.003):
    """A panel on the cloth (pocket, placket, hood): `at(u, v)` (u, v in
    0..1) gives a point in front of the cloth, cast along `direction` onto
    it and lifted `lift(u, v)` off; its border walls sink `sink` under the
    cloth so the panel reads as a separate layer. Returns the grid."""
    tl = tone_of(bm)
    grid, base = [], []
    for j in range(nv + 1):
        row, brow = [], []
        for i in range(nu + 1):
            u, v = i / nu, j / nv
            o = at(u, v)
            h = hit(tree, o, direction)
            loc, n = h if h else nearest(tree, o)
            x = bm.verts.new(loc + n * lift(u, v))
            x[tl] = tone(u, v)
            row.append(x)
            brow.append((loc, n))
        grid.append(row)
        base.append(brow)
    face_toward(bm, grid_faces(bm, grid, closed=False), lambda f: base[0][0][1])
    centre = grid[nv // 2][nu // 2].co.copy()
    # Border: walk the grid's edge, each vertex dropped to under the cloth.
    edge = [(0, i) for i in range(nu + 1)] + [(j, nu) for j in range(1, nv + 1)] + \
        [(nv, i) for i in range(nu - 1, -1, -1)] + [(j, 0) for j in range(nv - 1, 0, -1)]
    low = []
    for j, i in edge:
        loc, n = base[j][i]
        x = bm.verts.new(loc - n * sink)
        x[tl] = grid[j][i][tl] * 0.8
        low.append(x)
    top = [grid[j][i] for j, i in edge]
    face_toward(bm, grid_faces(bm, [top, low]), lambda f: f.calc_center_median() - centre)
    return grid


def tube(bm, pts, r, sides=6, tone=lambda t: 1.0):
    """A cord along a polyline (drawstrings), capped at the far end."""
    tl = tone_of(bm)
    rows = []
    for k, p in enumerate(pts):
        d = (pts[min(k + 1, len(pts) - 1)] - pts[max(k - 1, 0)]).normalized()
        u = d.orthogonal().normalized()
        w = d.cross(u)
        row = []
        for i in range(sides):
            a = i / sides * math.tau
            x = bm.verts.new(p + (u * math.cos(a) + w * math.sin(a)) * r)
            x[tl] = tone(k / (len(pts) - 1))
            row.append(x)
        rows.append(row)
    grid_faces(bm, rows)
    bm.faces.new(rows[-1])


def stud(bm, p, n, r, h, sides=8, tone=0.72):
    """A button: a short disc standing on the cloth at p, facing n."""
    tl = tone_of(bm)
    u = n.orthogonal().normalized()
    w = n.cross(u)
    rows = []
    for lift in (-0.001, h):
        row = []
        for i in range(sides):
            a = i / sides * math.tau
            x = bm.verts.new(p + n * lift + (u * math.cos(a) + w * math.sin(a)) * r)
            x[tl] = tone
            row.append(x)
        rows.append(row)
    grid_faces(bm, rows)
    bm.faces.new(rows[1])


def smoothstep(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


# ---------------------------------------------------------------- her measurements
class Body:
    """Her rest pose: landmarks (bone heads) and the surfaces garments fit
    over. Tops go over her tee (hidden under them, but its shape is the cut
    of a loose top); bottoms over her shorts and legs only, since a tee's
    hem hangs over them."""

    def __init__(self):
        self.armature, body = import_heroine()
        self.bone = {b.name: self.armature.matrix_world @ b.head_local for b in self.armature.data.bones}
        self.upper = body_region(body, lambda m, c: m in ('Body_00_SKIN', 'Tops_01_CLOTH', 'Bottoms_01_CLOTH'), 'upper')
        # (Her skin has no chest under the tee: the tee's chest closes it, so
        # the field knows inside from outside.)
        self.lower = body_region(body, lambda m, c: m in ('Body_00_SKIN', 'Bottoms_01_CLOTH') or (m == 'Tops_01_CLOTH' and c.z > 1.08), 'lower')
        fold_spring_groups(self.upper)

    def sleeve_volumes(self, x0, x1, r0, r1):
        """Loose sleeves: a tapered tube along each arm from |x| = x0 to x1."""
        bm = bmesh.new()
        for side in (1, -1):
            s = 'L' if side > 0 else 'R'
            sh, wr = self.bone[f'J_Bip_{s}_UpperArm'], self.bone[f'J_Bip_{s}_Hand']
            cone(bm, Vector((x0 * side, sh.y, sh.z)), Vector((x1 * side, wr.y, wr.z)), r0, r1)
        return bm


ARM_AXIS = (0.025, 1.274)   # her arms' axis in the T-pose (y, z), shoulder to wrist
NECK_AXIS = (0.0, 0.03)     # her neck's centre (x, y)
UP, DOWN, FRONT, BACK = Vector((0, 0, 1)), Vector((0, 0, -1)), Vector((0, -1, 0)), Vector((0, 1, 0))


def top_cuts(sleeve, hem, neck=(0.075, 0.07)):
    """Openings of a top: hem plane, sleeve ends, the neck hole (a little
    forward of her neck, so it dips at the front)."""
    return [plane((0, 0, hem), DOWN), plane((sleeve, 0, 0), (1, 0, 0)), plane((-sleeve, 0, 0), (-1, 0, 0)),
            neckline(*neck, (NECK_AXIS[0], NECK_AXIS[1] - 0.012))]


def openings(bm):
    """Rings of a top's openings: hem, [left, right] sleeves, neck."""
    hem = ring(find_loop(bm, lambda c: c.z < 1.0 and abs(c.x) < 0.1), 64, DOWN)
    sleeves = [ring(find_loop(bm, lambda c, s=s: c.x * s > 0.15), 32, Vector((s, 0, 0))) for s in (1, -1)]
    neck = ring(find_loop(bm, lambda c: c.z > 1.25 and abs(c.x) < 0.1), 48, UP)
    return hem, sleeves, neck


def rib_finish(bm, hem, sleeves, cuff=0.045):
    """Ribbed hem and cuffs; the sleeve gathers into its cuff."""
    pts, c = hem
    band(bm, pts, c, DOWN, [(-0.015, 0.975, 0), (0, 0.975, 0), (0.05, 0.955, 0)] + lip(0.05, 0.955), ribs=True)
    for side, (pts, c) in zip((1, -1), sleeves):
        band(bm, pts, c, Vector((side, 0, 0)),
             [(-0.015, 0.97, 0), (0, 0.93, 0), (0.012, 0.74, 0), (cuff, 0.68, 0)] + lip(cuff, 0.68), ribs=True)


def crew_neck(bm, neck, height=0.02):
    pts, c = neck
    band(bm, pts, c, UP, [(-0.01, 0.98, 0), (0, 0.98, 0), (height, 0.9, 0)] + lip(height, 0.9, 0.01), ribs=True)


def neck_angle(p, c):
    """Angle of p about her neck: 0 at the back, ±π at the front."""
    return math.atan2(p.x - c.x, p.y - c.y)


def sweatshirt(body):
    vols = body.sleeve_volumes(0.2, 0.53, 0.06, 0.042)
    bm = shell([body.upper, vols], 0.013, top_cuts(0.5, 0.836), 2400)
    hem, sleeves, neck = openings(bm)
    rib_finish(bm, hem, sleeves)
    crew_neck(bm, neck)
    return bm


def hoodie(body):
    vols = body.sleeve_volumes(0.2, 0.53, 0.064, 0.044)
    bm = shell([body.upper, vols], 0.015, top_cuts(0.5, 0.836), 2400)
    tree = surface_tree(bm)
    hem, sleeves, neck = openings(bm)
    rib_finish(bm, hem, sleeves)
    crew_neck(bm, neck, 0.014)
    npts, nc = neck

    # Hood, folded down on her back: u runs from one shoulder round the back
    # to the other along the neckline, v down to its rounded bottom. It
    # bulges off the back most a third of the way down; near the neck the
    # opening shows its lining (darker), edged by a ridge.
    rim = sorted(npts, key=lambda p: neck_angle(p, nc))

    def neck_at(a):
        """The neckline at angle a, interpolated."""
        for p, q in zip(rim, rim[1:]):
            pa, qa = neck_angle(p, nc), neck_angle(q, nc)
            if pa <= a <= qa:
                return p.lerp(q, (a - pa) / max(qa - pa, 1e-9))
        return rim[0] if a < 0 else rim[-1]

    def at(u, v):
        uu = u * 2 - 1
        b = neck_at(uu * 1.75)   # ±100° from the back
        bottom = Vector((uu * 0.135, 0, 1.10 + 0.10 * (1 - math.sqrt(max(0.0, 1 - uu * uu)))))
        return Vector((b.x + (bottom.x - b.x) * v ** 0.9, 0.5, b.z - 0.006 + (bottom.z - b.z + 0.006) * v))

    def opening(u):
        return 0.38 * (1 - (u * 2 - 1) ** 2) ** 0.7

    def lift(u, v):
        uu = u * 2 - 1
        h = 0.004 + 0.05 * math.sqrt(max(0.0, 1 - uu * uu)) * math.sin(math.pi * min(1.0, 0.35 + 0.65 * v)) ** 0.6
        return h + 0.006 * math.exp(-((v - opening(u)) / 0.05) ** 2)

    patch(bm, tree, 14, 8, at, FRONT, lift, tone=lambda u, v: 0.66 if v < opening(u) - 0.02 else 1.0)

    # Kangaroo pocket on the belly, narrower at the top (slanted side openings).
    patch(bm, tree, 8, 5, lambda u, v: Vector(((u * 2 - 1) * (0.125 - 0.035 * v), -0.5, 0.852 + 0.14 * v)), BACK,
          lambda u, v: 0.005, tone=lambda u, v: 0.97)

    # Drawstrings from the neckline down the chest, with aglets.
    front = [p for p in npts if p.y < nc.y]
    for side in (1, -1):
        top = min(front, key=lambda p: abs(p.x - 0.032 * side))
        pts = []
        for k in range(9):
            t = k / 8
            o = Vector((top.x * (1 + 0.35 * t), -0.5, top.z - 0.012 - 0.16 * t))
            h = hit(tree, o, BACK)
            loc, n = h if h else nearest(tree, o)
            pts.append(loc + n * 0.008)
        tube(bm, pts, 0.0032, tone=lambda t: 0.55 if t > 0.88 else 0.92)
    return bm


def blouse(body):
    bm = shell([body.upper], 0.011, top_cuts(0.27, 0.85, neck=(0.07, 0.065)), 2200)
    # Puffed sleeves: the cloth swells about the arm from the shoulder and
    # gathers back into the cuff.
    end = 0.264
    y0, z0 = ARM_AXIS
    for v in bm.verts:
        ax = abs(v.co.x)
        if ax > 0.15:
            k = 1 + 0.14 * math.sin(math.pi * min(1.0, (ax - 0.15) / (end - 0.15)) ** 0.8)
            v.co.y = y0 + (v.co.y - y0) * k
            v.co.z = z0 + (v.co.z - z0) * k
    # Shirt-tail hem: lower at the front and back than at the sides.
    for v in bm.verts:
        if v.co.z < 0.93:
            v.co.z -= 0.025 * (1 - min(1.0, abs(v.co.x) / 0.18) ** 2) * (0.93 - v.co.z) / 0.08
    bm.normal_update()
    tree = surface_tree(bm)
    hem, sleeves, neck = openings(bm)
    for side, (pts, c) in zip((1, -1), sleeves):
        band(bm, pts, c, Vector((side, 0, 0)), [(-0.01, 0.97, 0), (0, 0.9, 0), (0.014, 0.82, 0)] + lip(0.014, 0.82, 0.008))
    pts, c = hem
    band(bm, pts, c, DOWN, [(-0.01, 0.985, 0), (0, 0.985, 0), (0.004, 0.985, 0)] + lip(0.004, 0.985, 0.004))
    npts, nc = neck
    band(bm, npts, nc, UP, [(-0.008, 0.98, 0), (0, 0.98, 0), (0.008, 0.95, 0)] + lip(0.008, 0.95, 0.006))

    # Round (Peter Pan) collar lying on the shoulders, parted at the front:
    # one strip from the left front round the back to the right front, its
    # ends rounded, its outer edge folding down onto the blouse.
    gap, tl = 0.2, tone_of(bm)
    dense = [q for a, b in zip(npts, npts[1:] + npts[:1]) for q in (a, a.lerp(b, 0.5))]
    dense = sorted((p for p in dense if abs(neck_angle(p, nc)) < math.pi - gap), key=lambda p: neck_angle(p, nc))
    rows = []
    for v in (0.0, 0.33, 0.66, 1.0):
        row = []
        for p in dense:
            room = math.pi - gap - abs(neck_angle(p, nc))
            w = 0.05 * math.sqrt(max(0.0, 1 - max(0.0, (0.3 - room) / 0.3) ** 2))
            out = Vector((p.x - nc.x, p.y - nc.y, 0)).normalized()
            loc, n = nearest(tree, p + out * (w * v) + Vector((0, 0, 0.004 - 0.02 * v)))
            x = bm.verts.new(loc + n * (0.005 + 0.002 * (1 - v)))
            x[tl] = 1.0
            row.append(x)
        rows.append(row)
    face_toward(bm, grid_faces(bm, rows, closed=False), lambda f: UP)
    sunk = []
    for x in rows[-1]:
        loc, n = nearest(tree, x.co)
        y = bm.verts.new(loc - n * 0.002)
        y[tl] = 0.8
        sunk.append(y)
    face_toward(bm, grid_faces(bm, [rows[-1], sunk], closed=False),
                lambda f: f.calc_center_median() - Vector((nc.x, nc.y, f.calc_center_median().z)))

    # Placket down the front, with buttons.
    hem_front = min((p for p in hem[0] if abs(p.x) < 0.03), key=lambda p: p.y).z
    neck_front = min(npts, key=lambda p: p.y).z
    bottom, top = hem_front + 0.006, neck_front - 0.012
    patch(bm, tree, 2, 12, lambda u, v: Vector(((u * 2 - 1) * 0.012, -0.5, bottom + (top - bottom) * v)), BACK,
          lambda u, v: 0.0025, tone=lambda u, v: 0.94)
    for k in range(5):
        z = top - 0.025 - k * (top - 0.025 - bottom - 0.04) / 4
        loc, n = hit(tree, Vector((0, -0.5, z)), BACK)
        stud(bm, loc + n * 0.0025, n, 0.0055, 0.0025)
    return bm


def leg_axis(body, side, z):
    """Her leg's centre line at height z (hip joint to ankle)."""
    s = 'L' if side > 0 else 'R'
    hip, knee, ankle = (body.bone[f'J_Bip_{s}_{b}'] for b in ('UpperLeg', 'LowerLeg', 'Foot'))
    a, b = (hip, knee) if z > knee.z else (knee, ankle)
    c = a.lerp(b, (a.z - z) / (a.z - b.z))
    return Vector((c.x, c.y, z))


def jeans(body):
    # Straight through the thigh, narrowest at the knee, a slight flare at
    # the hem (over the sneakers). Below the knee the leg's middle is behind
    # the bone (her calf).
    vols = bmesh.new()
    calf = Vector((0, 0.02, 0))
    for side in (1, -1):
        knee = leg_axis(body, side, 0.5) + calf
        cone(vols, leg_axis(body, side, 0.78), knee, 0.07, 0.05)
        cone(vols, knee, leg_axis(body, side, 0.09) + calf, 0.05, 0.062)
    # (Closed less than tops: the hems must not bridge between her ankles.)
    # Snug at the hips (her tee's hem hangs over them, a few mm off her
    # shorts); closed less than tops so the hems don't bridge her ankles.
    bm = shell([body.lower, vols], 0.003, [plane((0, 0, 0.985), UP), plane((0, 0, 0.115), DOWN)], 2600, close=0.008)
    tl = tone_of(bm)
    bm.normal_update()
    # Denim: sides and back a little darker than the faded fronts; side
    # seams and inseams; the front pockets' curved openings.
    for v in bm.verts:
        p, side = v.co, (1 if v.co.x > 0 else -1)
        t = 0.9 + 0.1 * max(0.0, -v.normal.y)
        if p.z < 0.79:
            c = leg_axis(body, side, p.z) + calf * smoothstep(0.6, 0.5, p.z)
            a = math.atan2(p.y - c.y, (p.x - c.x) * side)      # 0 outside, ±π inside
            if abs(a) < 0.09 or abs(a) > math.pi - 0.09:
                t *= 0.8
        elif abs(p.y) < 0.006 and abs(p.x) > 0.1:
            t *= 0.8
        if p.y < -0.02 and 0.875 < p.z < 0.98:
            curve = 0.065 + 0.055 * ((0.98 - p.z) / 0.105) ** 0.6
            if abs(abs(p.x) - curve) < 0.006:
                t *= 0.8
        v[tl] = t
    tree = surface_tree(bm)
    waist = ring(find_loop(bm, lambda c: c.z > 0.9), 64, UP)
    band(bm, *waist, UP, [(-0.012, 0.99, 0), (0, 0.99, 0), (0.03, 0.985, 0)] + lip(0.03, 0.985), tone=0.95)
    for side in (1, -1):
        hem = ring(find_loop(bm, lambda c, s=side: c.z < 0.3 and c.x * s > 0), 32, DOWN)
        band(bm, *hem, DOWN, [(-0.012, 0.985, 0), (0, 0.985, 0), (0.012, 0.985, 0)] + lip(0.012, 0.985, 0.008), tone=0.9)
        # Back pocket, pointed at the bottom, below her tee's hem.
        patch(bm, tree, 4, 5, lambda u, v, s=side: Vector((s * 0.075 + (u * 2 - 1) * 0.042, 0.5,
                                                            0.845 - 0.085 * v - 0.016 * smoothstep(0.6, 1, v) * (1 - abs(u * 2 - 1)))),
              FRONT, lambda u, v: 0.001, tone=lambda u, v: 0.95)
    return bm


def convex_radius(points, angle):
    """Distance from the origin to a convex polygon's edge along `angle`."""
    d = Vector((math.cos(angle), math.sin(angle)))
    best = 0.0
    for a, b in zip(points, points[1:] + points[:1]):
        e = b - a
        den = d.x * e.y - d.y * e.x
        if abs(den) < 1e-12:
            continue
        t = (a.x * e.y - a.y * e.x) / den           # along the ray
        s = (a.x * d.y - a.y * d.x) / den           # along the edge
        if t > 0 and -1e-6 <= s <= 1 + 1e-6:
            best = max(best, t)
    return best


SKIRT_ROWS = (0.975, 0.955, 0.93, 0.90, 0.87, 0.84, 0.80, 0.75, 0.69, 0.63, 0.56, 0.49)
SKIRT_CENTRE = Vector((0.0, -0.004))   # her hips (x, y)
PLEATS = 20


def skirt(body):
    """Pleated A-line, knee length: rings around her hips' convex envelope
    (bridging the gap between her legs), never narrower than the ring
    above, flaring below the hips; knife pleats open toward the hem. Two
    layers (the inside shows when she sits), joined at the hem and waist."""
    tree = bvh_of(body.lower)
    n = PLEATS * 4
    angles = [j / n * math.tau for j in range(n)]
    radii, prev = [], None
    for z in SKIRT_ROWS:
        pts = []
        for a in angles:
            d = Vector((math.cos(a), math.sin(a), 0))
            loc = tree.ray_cast(Vector((SKIRT_CENTRE.x, SKIRT_CENTRE.y, z)) + d * 0.5, -d, 0.5)[0]
            if loc:
                pts.append(loc.xy - SKIRT_CENTRE)
        hull = [pts[i] for i in convex_hull_2d(pts)]
        # (Snug above the hem of her tee, which hangs over the waist.)
        r = [convex_radius(hull, a) + 0.004 + max(0.0, 0.83 - z) * 0.22 for a in angles]
        if prev:
            r = [max(x, y) for x, y in zip(r, prev)]
        radii.append(r)
        prev = r
    bm = bmesh.new()
    tl = bm.verts.layers.float.new('tone')
    outer, inner = [], []
    for z, r in zip(SKIRT_ROWS, radii):
        amp = 0.08 * smoothstep(0.84, 0.6, z)
        o_row, i_row = [], []
        for j, a in enumerate(angles):
            k = r[j] * (1 + amp * ((j % 4) / 3 - 0.5))
            d = Vector((math.cos(a), math.sin(a), 0))
            for row, rad, tone in ((o_row, k, 0.92 if z > 0.95 else 1.0), (i_row, k - 0.003, 0.72)):
                v = bm.verts.new(Vector((SKIRT_CENTRE.x, SKIRT_CENTRE.y, z)) + d * rad)
                v[tl] = tone
                row.append(v)
        outer.append(o_row)
        inner.append(i_row)
    faces = grid_faces(bm, outer)
    face_toward(bm, faces, lambda f: f.calc_center_median() - Vector((SKIRT_CENTRE.x, SKIRT_CENTRE.y, f.calc_center_median().z)))
    faces = grid_faces(bm, [outer[-1], inner[-1]]) + grid_faces(bm, [inner[0], outer[0]])
    rims = faces
    faces = grid_faces(bm, inner)
    face_toward(bm, faces, lambda f: Vector((SKIRT_CENTRE.x, SKIRT_CENTRE.y, f.calc_center_median().z)) - f.calc_center_median())
    face_toward(bm, rims[:n], lambda f: DOWN)
    face_toward(bm, rims[n:], lambda f: UP)
    return bm


def skirt_weights(o):
    """Hips at the waist, blending toward the hem to the thigh the cloth
    hangs over (both thighs at the front and back middle), so a stride or a
    seat carries the hem along instead of a leg pushing through it. The
    front follows the thighs most (seated, it lies on them); the back least
    (crouching, it stays over her bottom)."""
    hips, left, right = (o.vertex_groups.new(name=f'J_Bip_{b}') for b in ('C_Hips', 'L_UpperLeg', 'R_UpperLeg'))
    for v in o.data.vertices:
        p = v.co
        a = math.atan2(p.y - SKIRT_CENTRE.y, p.x - SKIRT_CENTRE.x)
        lean = (1 + math.cos(a)) / 2
        front = (1 - math.sin(a)) / 2
        h = (0.35 + 0.6 * front) * smoothstep(0.93, 0.62, p.z)
        hips.add([v.index], 1 - h, 'REPLACE')
        left.add([v.index], h * lean, 'REPLACE')
        right.add([v.index], h * (1 - lean), 'REPLACE')


# ---------------------------------------------------------------- finishing
def transfer_weights(o, source):
    """Skin weights from her body's nearest surface, smoothed (no seams
    where the nearest surface jumps, e.g. arm to chest under the armpit),
    at most 4 influences, normalised."""
    for g in source.vertex_groups:
        o.vertex_groups.new(name=g.name)
    m = o.modifiers.new('weights', 'DATA_TRANSFER')
    m.object = source
    m.use_vert_data = True
    m.data_types_verts = {'VGROUP_WEIGHTS'}
    m.vert_mapping = 'POLYINTERP_NEAREST'
    m.layers_vgroup_select_src = 'ALL'
    m.layers_vgroup_select_dst = 'NAME'
    bpy.ops.object.modifier_apply(modifier=m.name)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.object.vertex_group_smooth(group_select_mode='ALL', factor=0.5, repeat=3)
    bpy.ops.object.mode_set(mode='OBJECT')


def occlusion(o, others):
    """Soft ambient occlusion per vertex (folds, under the hood and pocket,
    armpits): share of short rays over the normal's hemisphere that hit."""
    tree = bvh_of(o, *others)
    dirs = []
    for i in range(32):
        z = 1 - (i + 0.5) / 16
        if z <= 0:
            break
        r = math.sqrt(1 - z * z)
        a = i * 2.39996
        dirs.append(Vector((r * math.cos(a), r * math.sin(a), z)))
    out = []
    for v in o.data.vertices:
        n = v.normal
        rot = n.to_track_quat('Z', 'Y')
        hits = sum(1 for d in dirs if tree.ray_cast(v.co + n * 0.002, rot @ d, 0.08)[0] is not None)
        out.append(1 - 0.3 * hits / len(dirs))
    return out


def finish(name, bm, body, source=None, weights=None, hides=(), covers=()):
    """The garment as one skinned mesh of her armature: weights, vertex
    colours (tone × occlusion), UVs, the shared neutral material, and the
    boxes of her skin it covers (`hides`, rest pose: the game stops drawing
    skin triangles inside them while it is worn, so no skin, nor its ink
    outline, can show through however she bends), and her other pieces it
    covers (`covers`, material names: they would poke out of it)."""
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    o = new_object(name, bm)
    o['covers'] = list(covers)
    # In glTF axes (x, z, -y), flat: [min xyz, max xyz] per box.
    o['hides'] = [c for (x0, y0, z0, x1, y1, z1) in hides for c in (x0, z0, -y1, x1, z1, -y0)]
    for p in o.data.polygons:
        p.use_smooth = True
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    if weights:
        weights(o)
    else:
        transfer_weights(o, source)
    bpy.ops.object.vertex_group_clean(group_select_mode='ALL', limit=0.01)
    bpy.ops.object.vertex_group_limit_total(group_select_mode='ALL', limit=4)
    bpy.ops.object.vertex_group_normalize_all(group_select_mode='ALL', lock_active=False)
    tone = o.data.attributes['tone'].data
    ao = occlusion(o, [body.lower])
    col = o.data.color_attributes.new('Color', 'FLOAT_COLOR', 'POINT')
    for i, c in enumerate(col.data):
        k = tone[i].value * ao[i]
        c.color = (k, k, k, 1)
    o.data.attributes.remove(o.data.attributes['tone'])
    o.data.color_attributes.active_color = col
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.004)
    bpy.ops.object.mode_set(mode='OBJECT')
    o.data.materials.append(mat('garment', '#ffffff', rough=1.0))
    o.parent = body.armature
    o.modifiers.new('armature', 'ARMATURE').object = body.armature
    print('GARMENT', name, 'tris', sum(len(p.vertices) - 2 for p in o.data.polygons), 'verts', len(o.data.vertices))
    return o


# Her skin under a top: the torso from the hips to below the shoulders, and
# each arm from the shoulder to `x` (the sleeve's end, short of its cuff).
TORSO = [(-0.2, -0.2, 0.87, 0.2, 0.2, 1.25)]


def arms(x):
    return [(0.12, -0.1, 1.18, x, 0.15, 1.37), (-x, -0.1, 1.18, -0.12, 0.15, 1.37)]


def main():
    reset()
    body = Body()
    made = [
        finish('garment_hoodie', hoodie(body), body, body.upper, hides=TORSO + arms(0.49)),
        finish('garment_sweatshirt', sweatshirt(body), body, body.upper, hides=TORSO + arms(0.49)),
        finish('garment_blouse', blouse(body), body, body.upper, hides=TORSO + arms(0.25)),
        finish('garment_jeans', jeans(body), body, body.lower, hides=[(-0.25, -0.2, 0.0, 0.25, 0.2, 0.975)],
               # (Her socks are rigid on her feet: a deep crouch swings them out through the calves.)
               covers=['sock']),
        finish('garment_skirt', skirt(body), body, weights=skirt_weights),
    ]
    bpy.ops.object.select_all(action='DESELECT')
    for o in made + [body.armature]:
        o.select_set(True)
    path = os.path.join(OUT, 'garments.glb')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_yup=True,
                              export_animations=False, export_morph=False, export_vertex_color='ACTIVE',
                              export_def_bones=True, export_extras=True)
    print('EXPORTED', path)


if __name__ == '__main__':
    main()
