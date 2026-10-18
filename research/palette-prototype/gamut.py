from ok import *
h=np.arange(0,360,0.25)
print("L     minC   @h      2nd-worst-region  maxC   @h   | C_min over hue-band ")
for L in [0.25,0.35,0.45,0.50,0.55,0.60,0.65,0.70,0.75,0.80,0.85,0.88,0.90,0.93,0.95,0.97,0.98,0.99]:
    c=maxC(np.full_like(h,L),h)
    i=c.argmin(); j=c.argmax()
    # local minima list
    mins=[(h[k],c[k]) for k in range(len(h)) if c[k]<=c[k-1] and c[k]<=c[(k+1)%len(h)]]
    mins=sorted(mins,key=lambda t:t[1])[:3]
    print(f"{L:.2f}  {c[i]:.4f} {h[i]:6.1f}  minima:{', '.join(f'{a:.0f}°={b:.3f}' for a,b in mins)}  max {c[j]:.3f}@{h[j]:.0f}")
