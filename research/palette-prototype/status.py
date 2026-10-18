from final import *
bg,_=role('editor.bg',H)
ST={'error':(0.550,0.190,27),'warning':(0.640,0.140,70),'info':(0.550,0.140,250),'success':(0.580,0.150,145)}
print("status colors (fixed abs hue): in gamut / WCAG vs editor.bg (min over bg hues) / hex")
for k,(L,C,h) in ST.items():
    c=srgb8(L,softC(L,C,h),h); print(f"  {k:8s} L{L} C{C} h{h}: Ceff {float(softC(L,C,h)):.3f} WCAG {wcag(c,bg).min():.2f} APCA {apca(c,bg).min():.1f} {hexs(c)}")
d=np.arange(-60,61,1.0)
for k,(L,C,h) in ST.items():
    Ha=(h+d)%360; acc=srgb8(0.54,softC(0.54,0.13,Ha),Ha); s=srgb8(L,softC(L,C,h),h)
    e=dE(acc,np.broadcast_to(s,acc.shape)); X=np.abs(d[e<0.10]).max() if (e<0.10).any() else 0
    # modulation: w=cos^2(pi d/2X) for |d|<30 : status L -= 0.08 w, C stays (soft-capped)
    Xw=30; w=np.where(np.abs(d)<Xw,np.cos(np.pi*d/(2*Xw))**2,0); Lm=L-0.08*w; sm=srgb8(Lm,softC(Lm,C,h),h)
    e2=dE(acc,sm)
    print(f"  accent vs {k:8s}: dE@d=0 {e[60]:.3f}, dE<0.10 for |d|<={X:.0f} deg; with L-dip(0.08,X=30): min dE {e2.min():.3f}, status WCAG min {wcag(sm,np.broadcast_to(bg[0],sm.shape)).min():.2f}")
print("\nn comparison: dE_OK between adjacent slots (max over the day)")
for n in [24,48,96,144,288]:
    Hn=np.arange(n+1)*360/n; out=[]
    for nm in ['accent','statusBar.bg','editor.bg','activityBar.bg','sel.editor']:
        c,_=role(nm,Hn); out.append(dE(c[1:],c[:-1]).max())
    c,_=tok('keyword',Hn,True); out.append(dE(c[1:],c[:-1]).max())
    print(f"  n={n:3d} step {360/n:5.2f}deg ({1440/n:4.0f} min): accent {out[0]:.4f} statusBar {out[1]:.4f} editorBg {out[2]:.4f} activityBar {out[3]:.4f} sel {out[4]:.4f} keyword(corr) {out[5]:.4f}")
print("\nTime->hue modes (accent hex)")
h0=29.23
for t in range(0,24,2):
    hn=(h0+15*t)%360; hs=(80-15*(t-12))%360
    print(f"  {t:02d}:00 normal h={hn:6.2f} {hexs(role('accent',np.array([hn]))[0][0])} {hexs(role('editor.bg',np.array([hn]))[0][0])} | sky h={hs:6.2f} {hexs(role('accent',np.array([hs]))[0][0])} {hexs(role('editor.bg',np.array([hs]))[0][0])}")
def band(f,lo,hi):
    ts=np.arange(0,24,0.25); m=[((f(t)-lo)%360)<=(hi-lo) for t in ts]; return [t for t,x in zip(ts,m) if x]
for name,f in [('normal',lambda t:(h0+15*t)%360),('sky',lambda t:(80-15*(t-12))%360)]:
    y=band(f,85,120); c=band(f,180,225); print(f"  {name}: accent in yellow/olive band 85-120: {min(y):.2f}-{max(y):.2f}h ; in cyan bottleneck 180-225: {min(c):.2f}-{max(c):.2f}h")
