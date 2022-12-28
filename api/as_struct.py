def struct(struct_class):
	# create a new init
	def struct_init(self, *args, **kwargs):
		i = 0 # we really don't need enumerate() here...
		for value in args:
			name = member_names[i]
			default_value = member_values[i]
			setattr(self, name, value if value is not None else default_value)
			i += 1 # ...we just need to inc an int
		for key,value in kwargs.items():
			i = member_names.index(key)
			default_value = member_values[i]
			setattr(self, key, value if value is not None else default_value)
	# extract the struct members
	member_names = []
	member_values = []
	for attr_name in dir(struct_class):
		if not attr_name.startswith('_'):
			value = getattr(struct_class, attr_name)
			if not callable(value):
				member_names.append(attr_name)
				member_values.append(value)
	# rebind and return
	struct_class.__init__ = struct_init
	return struct_class

@struct
class Test():
	a = 0
	b = 'cale'

t = Test(40, b='nope')
