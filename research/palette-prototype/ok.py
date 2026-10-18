import numpy as np
np.seterr(all="ignore")
M1=np.array([[0.4122214708,0.5363325363,0.0514459929],[0.2119034982,0.6806995451,0.1073969566],[0.0883024619,0.2817188376,0.6299787005]])
M2=np.array([[0.2104542553,0.7936177850,-0.0040720468],[1.9779984951,-2.4285922050,0.4505937099],[0.0259040371,0.7827717662,-0.8086757660]])
I2=np.array([[1,0.3963377774,0.2158037573],[1,-0.1055613458,-0.0638541728],[1,-0.0894841775,-1.2914855480]])
I1=np.array([[4.0767416621,-3.3077115913,0.2309699292],[-1.2684380046,2.6097574011,-0.3413193965],[-0.0041960863,-0.7034186147,1.7076147010]])
def lch2lab(L,C,h):
    h=np.radians(h); return np.stack(np.broadcast_arrays(L,C*np.cos(h),C*np.sin(h)),-1)
def lab2lin(lab): return ((lab@I2.T)**3)@I1.T
def lin2lab(lin): return np.cbrt(lin@M1.T)@M2.T
def enc(x):
    x=np.clip(x,0,1); return np.where(x<=0.0031308,12.92*x,1.055*np.power(x,1/2.4)-0.055)
def dec(x): return np.where(x<=0.04045,x/12.92,((x+0.055)/1.055)**2.4)
def lch2lin(L,C,h): return lab2lin(lch2lab(L,C,h))
def ingamut(L,C,h,eps=1e-6):
    lin=lch2lin(L,C,h); return np.all((lin>=-eps)&(lin<=1+eps),-1)
def maxC(L,h,it=40):
    L,h=np.broadcast_arrays(np.asarray(L,float),np.asarray(h,float))
    lo=np.zeros(L.shape); hi=np.full(L.shape,0.5)
    for _ in range(it):
        mid=(lo+hi)/2; ok=ingamut(L,mid,h); lo=np.where(ok,mid,lo); hi=np.where(ok,hi,mid)
    return lo
def srgb8(L,C,h):
    """gamut-map by chroma reduction (binary search, CSS4-like w/o JND clip), return 8-bit sRGB"""
    L,C,h=np.broadcast_arrays(*(np.asarray(v,float) for v in (L,C,h)))
    C=np.minimum(C,maxC(L,h))
    return np.round(enc(lch2lin(L,C,h))*255)
def lumY(rgb8):  # WCAG relative luminance
    return dec(rgb8/255)@np.array([0.2126,0.7152,0.0722])
def wcag(a,b):
    ya,yb=lumY(a),lumY(b); hi=np.maximum(ya,yb); lo=np.minimum(ya,yb); return (hi+0.05)/(lo+0.05)
def apca(txt,bg):
    co=np.array([0.2126729,0.7151522,0.0721750])
    def Y(c):
        y=((c/255)**2.4)@co; return np.where(y<0.022,y+(0.022-np.clip(y,0,0.022))**1.414,y)
    yt,yb=Y(txt),Y(bg)
    bow=(yb**0.56-yt**0.57)*1.14; wob=(yb**0.65-yt**0.62)*1.14
    out=np.where(yb>yt,np.where(bow<0.1,0,bow-0.027),np.where(wob>-0.1,0,wob+0.027))
    out=np.where(np.abs(yb-yt)<0.0005,0,out); return out*100
def rgb2lab8(rgb8): return lin2lab(dec(rgb8/255))
def dE(a8,b8): return np.linalg.norm(rgb2lab8(a8)-rgb2lab8(b8),axis=-1)
def hexs(rgb8): return '#%02x%02x%02x'%tuple(int(v) for v in rgb8)
