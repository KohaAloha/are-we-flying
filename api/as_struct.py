import copy


def struct(struct_class):
    # extract the struct members
    member_names = []
    member_values = []
    for attr_name in dir(struct_class):
        if not attr_name.startswith('_'):
            value = getattr(struct_class, attr_name)
            if not callable(value):
                member_names.append(attr_name)
                member_values.append(value)

    # create a new init
    def struct_init(self, *args, **kwargs):
        i = 0  # we really don't need enumerate() here...
        for value in args:
            name = member_names[i]
            default_value = member_values[i]
            setattr(self, name, value if value is not None else default_value)
            i += 1  # ...we just need to inc an int
        for key, value in kwargs.items():
            if key in member_names:
                i = member_names.index(key)
                default_value = member_values[i]
                setattr(self, key, value if value is not None else default_value)
        # fall through  to the struct constructor.
        if hasattr(self.__class__, 'constructor'):
            self.constructor(**kwargs)

    # A struct can be iterated over, yielding and ordered list
    # based on member names defined in the struct class.
    def member_iter(self):
        return [copy.deepcopy(getattr(self, name)) for name in member_names].__iter__()

    # Structs do not allow shallow copying. All copies are a deep copies.
    def deep_copy(self):
        return copy.deepcopy(self)

    # Some "maths" operation helpers:
    def member_add(self, *args):
        return struct_class(*[member_values[count] + value for count, value in enumerate(*args)])

    def member_sub(self, *args):
        return struct_class(*[member_values[count] - value for count, value in enumerate(*args)])

    def member_mul(self, *args):
        return struct_class(*[member_values[count] * value for count, value in enumerate(*args)])

    # Note that we do NOT implement division. The potential for errors is way too big.

    # rebind and return
    struct_class.__init__ = struct_init
    struct_class.__iter__ = member_iter
    struct_class.__copy__ = deep_copy
    struct_class.__add__ = member_add
    struct_class.__sub__ = member_sub
    struct_class.__mul__ = member_mul
    return struct_class
