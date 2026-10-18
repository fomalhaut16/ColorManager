# Reproduce: python3 final.py   (needs numpy; ok.py = OKLab/WCAG/APCA helpers)
from ok import *
N=96; H=np.arange(N)*360/N
def softC(L,C,h,p=6,m=0.98):                       # smooth min(C, 0.98*cap), scale-free, always in gamut
    K=m*maxC(L,h); return (C**-p+K**-p)**(-1/p)
def cr(h,v,step=30.0):                              # periodic Catmull-Rom over 12 anchors
    h=np.asarray(h,float)%360; i=np.floor(h/step).astype(int); t=h/step-i; n=len(v)
    p0,p1,p2,p3=(v[(i+k)%n] for k in (-1,0,1,2))
    return 0.5*(2*p1+(-p0+p2)*t+(2*p0-5*p1+4*p2-p3)*t**2+(-p0+3*p1-3*p2+p3)*t**3)
ROLES={ # name: (L, C, hue offset)  -- opaque result; alpha-blended ids solve alpha at emit time
 'editor.bg':(0.955,0.022,0),'panel.bg':(0.955,0.022,0),'tab.active':(0.955,0.022,0),
 'sidebar.bg':(0.935,0.030,0),'tab.inactive':(0.935,0.030,0),'tabs.strip':(0.928,0.032,0),
 'titleBar.bg':(0.922,0.034,0),'activityBar.bg':(0.910,0.040,0),
 'widget.bg':(0.975,0.012,0),'input.bg':(0.985,0.008,0),
 'border':(0.860,0.030,0),'border.strong':(0.780,0.040,0),
 'lineHighlight':(0.935,0.030,0),'hover.list':(0.915,0.036,0),
 'sel.list.active':(0.865,0.060,0),'sel.list.inactive':(0.895,0.040,0),
 'sel.editor':(0.875,0.060,0),'sel.editor.inactive':(0.900,0.040,0),'selHighlight':(0.900,0.045,0),'wordHighlight':(0.910,0.040,0),
 'find.current':(0.820,0.110,120),'find.other':(0.885,0.070,120),
 'indentGuide':(0.880,0.020,0),'indentGuide.active':(0.740,0.040,0),'scrollbar':(0.800,0.020,0),'scrollbar.active':(0.680,0.080,0),
 'lineNumber':(0.660,0.030,0),'lineNumber.active':(0.420,0.050,0),
 'fg.primary':(0.300,0.025,0),'fg.editor':(0.280,0.025,0),'fg.secondary':(0.470,0.030,0),'fg.disabled':(0.660,0.020,0),
 'accent':(0.540,0.130,0),'accent.hover':(0.490,0.130,0),'accent.link':(0.490,0.130,0),'focus':(0.580,0.130,0),'cursor':(0.490,0.150,0),
 'statusBar.bg':(0.500,0.110,0),'statusBar.debug':(0.500,0.110,180),'badge':(0.540,0.130,0),'button2.bg':(0.880,0.040,0),
}
TOK={ # name:(L, C, offset)
 'keyword':(0.490,0.150,0),'storage':(0.420,0.110,20),'function':(0.490,0.130,-60),'type':(0.490,0.110,-120),
 'string':(0.515,0.120,180),'number':(0.490,0.130,120),'parameter':(0.450,0.080,60),'property':(0.420,0.050,-120),
 'variable':(0.280,0.025,0),'comment':(0.620,0.035,0),'operator':(0.400,0.020,0),'regexp':(0.450,0.110,150),
 'decorator':(0.530,0.100,-30),
}
ANCH=np.array([ # abs hue anchor: dL, dh   (vivid-text group, C>=0.07)
 [0,0,0],[30,0,0],[60,0.010,-4],[90,0.040,-12],[120,0,6],[150,-0.010,2],
 [180,-0.020,-5],[210,-0.020,5],[240,0,0],[270,0.010,0],[300,0,0],[330,0,0]])
def tok(name,Hm,corr):
    L,C,o=TOK[name]; h=(Hm+o)%360; L=np.full_like(h,L)
    if corr and C>=0.07: L=L+cr(h,ANCH[:,1]); h=(h+cr(h,ANCH[:,2]))%360
    Ce=softC(L,C,h); return srgb8(L,Ce,h),Ce
def role(name,Hm):
    L,C,o=ROLES[name]; h=(Hm+o)%360; Ce=softC(L,C,h); return srgb8(L,Ce,h),Ce
if __name__=='__main__':
    Hf=np.arange(0,360,1.0)
    print("ROLES  L C | cap(min over hue) | C_eff min..max | in gamut | hex @H=29/90/150/209/268/320")
    for k,(L,C,o) in ROLES.items():
        c,Ce=role(k,Hf); cap=maxC(np.full_like(Hf,L),(Hf+o)%360)
        ok_=bool(np.all(ingamut(L,Ce,(Hf+o)%360)))
        print(f"{k:20s} {L:.3f} {C:.3f} | {cap.min():.4f}@{((Hf+o)%360)[cap.argmin()]:3.0f} | {Ce.min():.3f}..{Ce.max():.3f} | {ok_} | "+' '.join(hexs(role(k,np.array([x]))[0][0]) for x in (29.23,90,150,209,268,320)))
    bg,_=role('editor.bg',H)
    print("\nUI text pairs: WCAG min / APCA |min|")
    for fg,b in [('fg.editor','editor.bg'),('fg.primary','sidebar.bg'),('fg.primary','activityBar.bg'),('fg.secondary','sidebar.bg'),
                 ('fg.disabled','sidebar.bg'),('lineNumber','editor.bg'),('lineNumber.active','lineHighlight'),('fg.primary','sel.list.active'),
                 ('accent.link','editor.bg'),('fg.editor','sel.editor'),('fg.editor','find.current')]:
        a,_=role(fg,H); bb,_=role(b,H); print(f"  {fg:18s} on {b:16s} WCAG {wcag(a,bb).min():5.2f}  APCA {np.abs(apca(a,bb)).min():5.1f}")
    W=np.array([255.,255,255])
    for b in ['accent','statusBar.bg','statusBar.debug','badge']:
        bb,_=role(b,H); print(f"  white on {b:16s} WCAG {wcag(W,bb).min():5.2f}..{wcag(W,bb).max():.2f}  APCA {np.abs(apca(W,bb)).min():5.1f}")
    for b in ['border','border.strong','focus','indentGuide.active']:
        bb,_=role(b,H); print(f"  {b:18s} vs editor.bg (non-text) WCAG {wcag(bb,bg).min():.2f}")
    sel,_=role('sel.editor',H); lh,_=role('lineHighlight',H)
    for corr in (False,True):
        print(f"\nTOKENS ({'with anchor corrections' if corr else 'algorithm only'}) vs editor.bg; plus on selection/lineHighlight")
        rgb={}
        for k in TOK:
            c,Ce=tok(k,H,corr); rgb[k]=c; w=wcag(c,bg); a=apca(c,bg)
            print(f"  {k:10s} WCAG {w.min():5.2f}@H{H[w.argmin()]:5.1f}..{w.max():5.2f} | APCA {a.min():5.1f}..{a.max():5.1f} | onSel {wcag(c,sel).min():4.2f} onLH {wcag(c,lh).min():4.2f} | Ceff {Ce.min():.3f}..{Ce.max():.3f}")
        ks=list(TOK); res=[]
        for i in range(len(ks)):
            for j in range(i+1,len(ks)):
                d=dE(rgb[ks[i]],rgb[ks[j]]); res.append((d.min(),ks[i],ks[j],H[d.argmin()],d.mean()))
        res.sort(); print("  weakest pairs:"); [print(f"    {a}-{b}: min {m:.3f}@H{h:.1f} mean {mn:.3f}") for m,a,b,h,mn in res[:10]]
        print("  pairs <0.06:",sum(r[0]<0.06 for r in res),"of",len(res),"| <0.08:",sum(r[0]<0.08 for r in res))
