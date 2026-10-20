import sqlite3, struct, math
def wkb(b, o=0):
    bo = '<' if b[o] == 1 else '>'; t = struct.unpack_from(bo+'I', b, o+1)[0]; o += 5
    t %= 1000
    def pts(o):
        n = struct.unpack_from(bo+'I', b, o)[0]; o += 4
        r = [struct.unpack_from(bo+'dd', b, o+16*i) for i in range(n)]; return r, o+16*n
    if t == 2: return ('L', pts(o)[0]), pts(o)[1]
    if t == 3:
        n = struct.unpack_from(bo+'I', b, o)[0]; o += 4; rings = []
        for _ in range(n): r, o = pts(o); rings.append(r)
        return ('P', rings), o
    if t in (5, 6):
        n = struct.unpack_from(bo+'I', b, o)[0]; o += 4; parts = []
        for _ in range(n): g, o = wkb(b, o); parts.append(g)
        return ('M', parts), o
    raise ValueError(t)
def geom(blob):
    flags = blob[3]; env = (flags >> 1) & 7; esz = [0, 32, 48, 48, 64][env]
    return wkb(blob, 8+esz)[0]
# OSGB36 national grid -> WGS84 (OS "A guide to coordinate systems", Helmert ~5 m)
def bng2wgs(E, N):
    a, b = 6377563.396, 6356256.909; F0 = 0.9996012717; lat0 = math.radians(49); lon0 = math.radians(-2); N0, E0 = -100000, 400000
    e2 = 1 - b*b/(a*a); n = (a-b)/(a+b); lat = lat0; M = 0
    while N - N0 - M >= 1e-5:
        lat = (N - N0 - M)/(a*F0) + lat
        M = b*F0*((1+n+1.25*n**2+1.25*n**3)*(lat-lat0) - (3*n+3*n**2+21/8*n**3)*math.sin(lat-lat0)*math.cos(lat+lat0)
                  + (15/8*n**2+15/8*n**3)*math.sin(2*(lat-lat0))*math.cos(2*(lat+lat0)) - 35/24*n**3*math.sin(3*(lat-lat0))*math.cos(3*(lat+lat0)))
    s = math.sin(lat); nu = a*F0/math.sqrt(1-e2*s*s); rho = a*F0*(1-e2)/(1-e2*s*s)**1.5; eta2 = nu/rho-1
    t = math.tan(lat); sec = 1/math.cos(lat); dE = E-E0
    VII = t/(2*rho*nu); VIII = t/(24*rho*nu**3)*(5+3*t*t+eta2-9*t*t*eta2); IX = t/(720*rho*nu**5)*(61+90*t*t+45*t**4)
    X = sec/nu; XI = sec/(6*nu**3)*(nu/rho+2*t*t); XII = sec/(120*nu**5)*(5+28*t*t+24*t**4); XIIA = sec/(5040*nu**7)*(61+662*t*t+1320*t**4+720*t**6)
    phi = lat - VII*dE**2 + VIII*dE**4 - IX*dE**6; lam = lon0 + X*dE - XI*dE**3 + XII*dE**5 - XIIA*dE**7
    # to cartesian on Airy, Helmert to WGS84, back
    s = math.sin(phi); nu = a/math.sqrt(1-e2*s*s)
    x = nu*math.cos(phi)*math.cos(lam); y = nu*math.cos(phi)*math.sin(lam); z = (1-e2)*nu*s
    tx, ty, tz, sc = 446.448, -125.157, 542.060, -20.4894e-6
    rx, ry, rz = [math.radians(v/3600) for v in (0.1502, 0.2470, 0.8421)]
    x2 = tx + (1+sc)*x - rz*y + ry*z; y2 = ty + rz*x + (1+sc)*y - rx*z; z2 = tz - ry*x + rx*y + (1+sc)*z
    a2, b2 = 6378137.0, 6356752.3142; e22 = 1-b2*b2/(a2*a2); p = math.hypot(x2, y2); la = math.atan2(z2, p*(1-e22))
    for _ in range(6):
        nu2 = a2/math.sqrt(1-e22*math.sin(la)**2); la = math.atan2(z2+e22*nu2*math.sin(la), p)
    return math.degrees(la), math.degrees(math.atan2(y2, x2))
def dp(pts, tol):
    if len(pts) < 3: return pts
    if pts[0] == pts[-1] and len(pts) > 3:  # closed ring: split at the farthest vertex
        k = max(range(len(pts)), key=lambda i: (pts[i][0]-pts[0][0])**2 + (pts[i][1]-pts[0][1])**2)
        return dp(pts[:k+1], tol)[:-1] + dp(pts[k:], tol)
    keep = [0, len(pts)-1]; stack = [(0, len(pts)-1)]
    while stack:
        i, j = stack.pop(); ax, ay = pts[i]; bx, by = pts[j]; dx, dy = bx-ax, by-ay; L = math.hypot(dx, dy) or 1e-9
        best, bi = 0, -1
        for k in range(i+1, j):
            d = abs(dy*(pts[k][0]-ax) - dx*(pts[k][1]-ay))/L
            if d > best: best, bi = d, k
        if best > tol: keep.append(bi); stack += [(i, bi), (bi, j)]
    return [pts[k] for k in sorted(keep)]
