def test(x: any) -> str: return 'bad' if x is None else 'good'


def lerp(r: float, a: float, b: float) -> float:
    return (1 - r) * a + r * b


def map(v: float, ds: float, de: float, ts: float, te: float) -> float:
    d: float = (de-ds)
    if d == 0:
        return ts
    return ts + (v-ds) * (te-ts)/d


def constrain(v: float, m: float, M: float) -> float:
    if m > M:
        return constrain(v, M, m)
    return M if v > M else m if v < m else v


def constrain_map(v: float, ds: float, de: float, ts: float, te: float, lm=None, LM=None) -> float:
    val = constrain(map(v, ds, de, ts, te), ts, te)
    if lm is None or LM is None:
        return val
    if val < lm:
        return val
    if val > LM:
        return val
    mid = (lm + LM) / 2
    if val > lm and val <= mid:
        return lm
    if val < LM and val >= mid:
        return LM
    return val


def get_compass_diff(current: float, target: float, direction: float = 1) -> float:
    diff: float = (current - 360) if current > 180 else current
    target: float = target - diff
    result: float = target if target < 180 else target - 360
    if direction > 0:
        return result
    return 360 - target if target < 180 else target - 360
