"""Exports reference values from the prototype for the TypeScript unit tests.

Usage: python3 export_reference.py > ../../test/fixtures/prototype-reference.json
"""
import json
import numpy as np
from final import ROLES, TOK, ANCH, role, tok, softC, cr
from ok import maxC, srgb8, wcag, apca, dE, hexs

hues = [0.0, 29.234, 45.0, 90.0, 104.5, 150.0, 200.0, 268.0, 300.0, 359.0]
H = np.array(hues)

def hx(rgb):
    return [hexs(c) for c in np.asarray(rgb).reshape(-1, 3)]

out = {
    "hues": hues,
    "maxChroma": {f"{L}": [float(v) for v in maxC(np.full_like(H, L), H)] for L in (0.3, 0.5, 0.955)},
    "softChroma": {f"{L},{C}": [float(v) for v in softC(np.full_like(H, L), C, H)] for L, C in ((0.54, 0.13), (0.955, 0.022))},
    "roles": {name: hx(role(name, H)[0]) for name in ROLES},
    "tokensAnchored": {name: hx(tok(name, H, True)[0]) for name in TOK},
    "anchorDL": [float(v) for v in cr(H, ANCH[:, 1])],
    "anchorDH": [float(v) for v in cr(H, ANCH[:, 2])],
}
pairs = [((40, 40, 40), (250, 240, 235)), ((255, 255, 255), (152, 72, 61)), ((120, 120, 120), (230, 230, 230)), ((10, 20, 200), (240, 250, 255))]
out["contrast"] = [
    {"text": list(a), "bg": list(b), "wcag": float(wcag(np.array(a, float), np.array(b, float))), "apca": float(apca(np.array(a, float), np.array(b, float)))}
    for a, b in pairs
]
out["deltaE"] = [{"a": list(a), "b": list(b), "dE": float(dE(np.array(a, float), np.array(b, float)))} for a, b in pairs]
print(json.dumps(out, indent=1))
