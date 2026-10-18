from final import *
bg,_=role('editor.bg',H)
ST={'error':(0.550,0.190,27,-1),'warning':(0.640,0.140,70,+1),'info':(0.550,0.140,250,-1),'success':(0.580,0.150,145,+1)}
d=np.arange(-60,61,1.0)
for amp in [0.06,0.08,0.10]:
  for X in [30,40]:
    row=[]
    for k,(L,C,h,s) in ST.items():
        Ha=(h+d)%360; acc=srgb8(0.54,softC(0.54,0.13,Ha),Ha)
        w=np.where(np.abs(d)<X,np.cos(np.pi*d/(2*X))**2,0); Lm=L+s*amp*w; sm=srgb8(Lm,softC(Lm,C,h),h)
        e=dE(acc,sm); wc=min(wcag(sm[60],b) for b in bg)
        row.append(f"{k} minE {e.min():.3f} (Lpeak {L+s*amp:.2f}, WCAG@peak {wc:.2f})")
    print(f"amp {amp} X {X}: "+" | ".join(row))
