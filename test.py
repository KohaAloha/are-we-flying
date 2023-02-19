import json


def better(instance):
    return {k: v
            for k, v in vars(instance).items()
            if not str(k).startswith('_')}


class X():
    def __init__(self, value=None):
        self.value = value

    def __iter__(self):
        print("oh look")
        return []


x = X()
x_json = json.dumps(x, default=better)
print(x_json)
