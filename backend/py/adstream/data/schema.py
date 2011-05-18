#! /usr/bin/python

# Metaclass machinery: provides schema and instance creation, AOP-like method wrappers

import copy as sysCopy

def _collectDeclarations( dct, policies ):
	declarations = {}
	for name, typ in dct.items():
		if name in policies or isinstance( typ, type ):
			declarations[ name ] = dct.pop( name )
	return declarations

def _cloneClass( cls ):
	return type( cls )( cls.__name__, cls.__bases__, dict( cls.__dict__ ) ) if _is_schema_element( cls ) else cls

def _makeClassDict( args, policies, core ):
	dct = policies.copy()
	dct.update( ( p for p in args.iteritems() if p[0] in policies ) )
	dct['_core_'] = core
	dct['_schema'] = dict( ( ( arg[0], _cloneClass( arg[1] ) ) for arg in args.iteritems() if arg[0] not in policies ) )
	dct.update( dct['_schema'] )
	dct['_schema'].update( getattr( core, '_schema', {} ) )
	return dct

class _MetaClass(type):
	# Metaclass marker; has to be present in any derived metaclass as well
	_is_metaclass_ 	= True
	_policies_ = {}	

	# Converts "class UserClass( SchemaMetaClass )" into "class UserClass( SchemaMetaClass( Fields... ) )"
	class __metaclass__(type):
		def __new__( meta, name, bases, dct ):
			if '_is_metaclass_' not in dct:
				bases = tuple( (
					base if not isinstance( base, meta )
					else base( **_collectDeclarations( dct, base._policies_ ) )
					for base in bases
				) )
				return type.__new__( type, name, bases, dct )
			else:
				return type.__new__( meta, name, bases, dct )

	# Constructs class objects
	def __new__( meta, **kwarg ):
		return type.__new__(
			type,
			meta.__name__,
			( meta._core_, ),
			_makeClassDict( kwarg, meta._policies_, meta._core_ )
		)

	# Forwards any __init__ calls on derived metaclass to its _core_
	def __init__( self, *arg, **kwarg ):
		self._core_.__init__( self, *arg, **kwarg )

def is_a( schema_type, schema_metaclass ):
	return issubclass( schema_type, schema_metaclass._core_ )
		
# Serialization machinery: decides how to marshal objects and values

def _convert_plain( value, schema_type ):
	if isinstance( value, schema_type ):
		return value
	elif type(value) == str and schema_type == unicode:
		return value.decode('utf8')
	elif type(value) == unicode and schema_type == str:
		return value.encode('utf8')
	else:
		return schema_type( value )

def _is_fake_key( key ):
	return (type(key) == str or type(key) == unicode) and key[:1] == '@'
	
def _key_convert( value, schema_type ):
	if isinstance( value, schema_type ) or _is_fake_key( value ):
		return value
	return schema_type(value)
	
def _unmarshal( value, schema_type, **kwargs ):
	if value is None: return value
	if hasattr( schema_type, '_load_' ):
		result = schema_type()
		v = result._load_( value ) if _is_value_type( schema_type ) else result._load_( value, **kwargs )
		if not v and v is not None:	return None
		else:						return result
	else:
		return _convert_plain( value, schema_type )	

def _convert( value, schema_type, **kwargs ):
	if isinstance( value, schema_type ):	return value
	return _unmarshal( value, schema_type, **kwargs )

def _is_schema_element( schema_type ):
	return issubclass( schema_type, _SchemaCore )

def _is_value_type( schema_type ):
	return not issubclass( schema_type, _NonValueCore )

def _marshal( value, schema_type ):
	if value is None: return value

	if( hasattr( schema_type, '_save_' ) ):
		return _convert( value, schema_type )._save_()
	else: # Fun part -- guessing how to marshal serialization-unaware types
		value = _convert_plain( value, schema_type )
		if issubclass( schema_type, dict ) or issubclass( schema_type, str ) or issubclass( schema_type, unicode ) or \
		   issubclass( schema_type, int ) or issubclass( schema_type, float ) or issubclass( schema_type, long ) or \
		   issubclass( schema_type, bool ): # These types are valid wire-representation
			return value
		if hasattr( schema_type, '__iter__' ): # An iterable of sorts, but not a dict or string
			return list( value )
		# When everything else fails, make it a string (let the object pick str() vs unicode())
		return repr( value )

# Generic struct-like object
class _StructCore(object):

		def __init__( self, **kwarg ):
			for arg in kwarg.iteritems():
				setattr( self, *arg )
				
			for name, typ in self._schema.iteritems():
				if name not in self.__dict__: # Whichever __init__ put it there
					setattr( self, name, typ() if self._missing_prop_policy_[0] == Policy.Provide and _is_value_type( typ ) else None )

		def __setattr__( self, name, value ):
			if name not in self._schema:
				if self._extra_prop_policy_[1] == Policy.Fail:
					raise TypeError( "Cannot initialize unknown property '%s.%s'" % ( type(self).__name__, str( name ) ) )
				object.__setattr__( self, name, value )
			else:
				object.__setattr__( self, name, _convert( value, self._schema[name] ) )
				
		def _load_( self, value, is_metadata = False, **kwarg ):
			any = False
			for name, val in value.iteritems():
				if name=='_':   continue
				if name in self._schema:
					v = _convert( val, self._schema[ name ], **kwarg )
					if v is not None or val is None:
						any = True
						setattr( self, name, v )
				elif self._extra_prop_policy_[0] == Policy.Fail:
					raise TypeError( "Cannot deserialize unknown property '%s.%s'" % ( type(self).__name__, str( name ) ) )
				elif self._extra_prop_policy_[0] == Policy.Provide:
					any = True
					setattr( self, name, val )
			
			for name, typ in self._schema.iteritems():
				if name not in value and name != '_':
					if self._missing_prop_policy_[0] == Policy.Provide and _is_value_type( typ ):
						setattr( self, name, typ() )
					elif self._missing_prop_policy_[0] == Policy.Fail:
						raise TypeError( "Missing property '%s.%s' during deserialization" % ( type(self).__name__, str( name ) ) )

			if is_metadata: return any
						
		def _save_(self):
			result = {}
			for name, typ in self._schema.iteritems():
				v = self.__dict__[name]
				if v is not None:
					result[name] = _marshal( v, typ )
				elif _is_value_type( typ ):
					if self._missing_prop_policy_[1] == Policy.Provide:
						result[name] = _marshal( typ(), typ )
					elif self._missing_prop_policy_[1] == Policy.Fail:
						raise TypeError( "Missing property '%s.%s' during serialization" % ( type(self).__name__, str( name ) ) )

			if self._extra_prop_policy_[1] != Policy.Ignore:
				for name, v in self.__dict__.iteritems():
					if name not in self._schema and name != '_key_':
						if self._extra_prop_policy_[1] == Policy.Fail or not _is_value_type( type(v) ):
							raise TypeError( "Cannot serialize unknown property '%s.%s'" % ( type(self).__name__, str( name ) ) )
						elif self._extra_prop_policy_[1] == Policy.Provide and _is_value_type( type(v) ):
							result[name] = _marshal( v, type(v) )

			return result

# Policy constants
class Policy(object):
	Fail, Ignore, Provide = range(3)

# Value-like types for object representations

class Struct( _MetaClass ):
	_is_metaclass_ 	= True

	_policies_ = {
		'_extra_prop_policy_'	: (Policy.Fail,Policy.Ignore),
		'_missing_prop_policy_' : (Policy.Ignore,Policy.Ignore)
	}

	class _core_(_StructCore):
		def _load_(self, value): # no optional arguments!
			_StructCore._load_(self,value)

class Array( _MetaClass ):
	_is_metaclass_ 	= True
	
	def __new__( meta, item ):
		return _MetaClass.__new__( meta, item = item )

	class _core_(list):
		def __init__(self, *arg):
			for item in arg if len(arg)!=1 or not hasattr( arg[0], '__iter__' ) else arg[0]:
				self.append( _convert( item, self._schema[ 'item' ] ) )

		def _load_(self, value):
			self.extend( ( _unmarshal( i, self._schema['item'] ) for i in value ) )

		def _save_(self):
			return [ _marshal( i, self._schema['item'] ) for i in self ]

# Schema elements -- nodes, objects, containers

class _NonValueCore(object):
	pass

def _combine_url( url, part ):
	return str(part) if len(url) == 0 else url + '/' + str(part)

class _SchemaCore(_NonValueCore):

	@classmethod
	def _set_url( cls, url ):
		cls._url = url
		cls._set_urls()
		
	def _url_( self ):
		return self._url % getattr( self, '_key_', () )

	def _set_key( self, key ):
		self._key_ = key
		
class _SchemaCoreNamed(_StructCore,_SchemaCore):

	def __setattr__( self, name, value ):
		_SchemaCore.__setattr__( self, name, value )
		if _is_schema_element( self._schema.get( name, type ) ) and hasattr( self, '_key_' ):
			getattr( self, name )._set_key( self._key_ )
	
	@classmethod
	def _set_urls( cls ):
		for name, typ in cls._schema.iteritems():
			if _is_schema_element(typ):
				typ._set_url( _combine_url( cls._url, name ) )
			
	def _set_key( self, key ):
		_SchemaCore._set_key( self, key )
		for name, typ in self._schema.iteritems():
			v = self.__dict__[name]
			if v is not None and _is_schema_element( typ ):
				v._set_key( key )

	def _load_( self, value, **kwarg ):
		self._ = _unmarshal( value.get( '_', {} ), self._schema['_'], **kwarg )
		_StructCore._load_( self, value, **kwarg )
        
class _SchemaElement(_MetaClass):
	_is_metaclass_ = True
	
	def __new__( *arg, **kwarg ):
		the_type = _MetaClass.__new__( *arg, **kwarg )
		the_type._url = ''
		the_type._set_urls()
		return the_type

def copy( elt, depth=0 ):
	if not elt._schema:	raise TypeError( "Cannot use schema.copy() with objects of type %s" % type(elt).__name__ )
	result = type( elt )( **dict( (
		(
			name,
			copy( getattr( elt, name ), (depth-1) if _is_schema_element( type ) else depth ) if not _is_value_type( type ) else sysCopy.copy( getattr( elt, name ) )
		)
		for name, type in elt._schema.iteritems()
		if ( not _is_schema_element( type ) or depth > 0 ) and getattr( elt, name ) is not None
	) )	)
	result._set_key( elt._key_ )
	return result

class Node( _SchemaElement ):
	_is_metaclass_ 	= True

	_policies_ = {
		'_extra_prop_policy_'	: (Policy.Fail,Policy.Fail),
		'_missing_prop_policy_' : (Policy.Fail,Policy.Fail)
	}

	def __new__( meta, **kwarg ):
		for arg in kwarg.iteritems():
			if _is_value_type( arg[1] ):
				raise TypeError( "%s cannot contain property '%s' of type %s" % ( meta.__name__, str( arg[0] ), arg[1].__name__ ) )
		return _SchemaElement.__new__( meta, **kwarg )

	_core_ = _SchemaCoreNamed

class MetaData(_MetaClass):
	_is_metaclass_ = True

	_policies_ = {
		'_extra_prop_policy_'	: (Policy.Ignore,Policy.Ignore),
		'_missing_prop_policy_' : (Policy.Ignore,Policy.Ignore)
	}
	
	class _core_(_NonValueCore,_StructCore):
		def _load_(self, value, url_args = {} ):
			from_url = dict( ( ( k, url_args.pop( k ) ) for k in url_args.keys() if k in self._schema and _is_value_type( self._schema[k] ) ) )
			t = _StructCore._load_( self, value, is_metadata = True, url_args = url_args )
			return _StructCore._load_( self, from_url, is_metadata = True ) or t

class Object(_SchemaElement):
	_is_metaclass_ 	= True

	_policies_ = {
		'_extra_prop_policy_'	: (Policy.Fail,Policy.Ignore),
		'_missing_prop_policy_' : (Policy.Provide,Policy.Ignore)
	}

	class _core_(_SchemaCoreNamed):
		def __eq__( self, other ):
			if not isinstance( other, type(self) ):
				return other.__eq__( self ) if isinstance( self, type(other) ) else False
			for name, typ in self._schema.iteritems():
				if _is_value_type(typ) and self.__dict__[ name ] != other.__dict__[ name ]:
					return False
			return True

		def __ne__( self, other ):
			return not self.__eq__( other )

	class _(MetaData):
		version = int
		partial = bool
		delete = bool
			
	def __new__( meta, _ = _, **kwarg ):
		return _SchemaElement.__new__( meta, _=_, **kwarg )
			
class _MetaDataSection(object):
	def __init__(self,name):
		self.name = name
	
	def __get__( self, instance, cls ):
		if instance._ is None:	instance._ = instance._schema['_']()
		if instance._.__dict__[self.name ] is None:
			setattr( instance._, self.name, instance._schema['_']._schema[self.name]() )
		return getattr( instance._, self.name )

	def __set__( self, instance, value ):
		if instance._ is None:	instance._ = instance._schema['_']()
		setattr( instance._, self.name, value )
	
class Container(_SchemaElement):
	_is_metaclass_ = True

	_policies_ = {
		'_extra_prop_policy_'	: (Policy.Fail,Policy.Ignore),
		'_missing_prop_policy_' : (Policy.Ignore,Policy.Ignore)
	}

	class view(_MetaClass):
		_is_metaclass_ = True

		class _core_(MetaData):
			offset = int
			count = int

	def __new__( meta, item, view = view(), filter = MetaData(), extra = MetaData(), key = str ):
		if not _is_schema_element( item ):
			raise TypeError( "%s cannot contain property 'item' of type %s" % ( meta.__name__, item.__name__ ) )
			
		item_metadata = item._schema.get( '_', MetaData() )
		if 'replaces' not in item_metadata._schema:
			item_metadata.replaces = str
			item_metadata._schema['replaces'] = item_metadata.replaces
			
		item._ = item_metadata
		item._schema['_'] = item._
			
		the_type = _SchemaElement.__new__( meta, item = item, _ = MetaData( partial=bool, view=view, filter=filter, extra=extra ), key = key )

		the_type.view = _MetaDataSection( 'view' )
		the_type.filter = _MetaDataSection( 'filter' )
		the_type.extra = _MetaDataSection( 'extra' )

		return the_type

	class _core_(dict,_SchemaCore):
		__setattr__ = object.__setattr__
	
		@classmethod
		def _set_urls(	cls ):
			cls._schema['item']._set_url( _combine_url( cls._url, '%s' ) )

		def _set_key( self, key ):
			_SchemaCore._set_key( self, key )
			for k,v in self.iteritems():
				if v is not None: v._set_key( key + (k,) )

		def __init__( self, arg = None, _=None, view=None, filter=None, extra=None ):
			if arg is not None:
				for key, value in arg if not isinstance( arg, dict ) else arg.iteritems():
					self[key] = value
			
			self._ = _convert( _, self._schema['_'] )
			
			if view is not None:	self.view = view
			if filter is not None:	self.filter = filter
			if extra is not None:	self.extra = extra

		def __setitem__( self, key, value ):
			key = _key_convert( key, self._schema['key'] )
			dict.__setitem__( self, key, _convert( value, self._schema['item'] ) )
			if value is not None: self[key]._set_key( getattr( self, '_key_', () ) + ( key, ) )

		def _load_( self, value, url_args={}, **kwarg ):
			md = dict( view={}, filter={} )
			md.update( value.get( '_', {} ) )
			self._ = _unmarshal( md, self._schema['_'], url_args=url_args, **kwarg )
			for key, val in value.iteritems():
				if key != '_':
					self[ _key_convert( key, self._schema['key'] ) ] = _unmarshal( val, self._schema['item'], url_args = dict(url_args), **kwarg ) if val is not None else None

		def _save_( self ):
			result = dict( (
				( _marshal( key, self._schema['key'] ), _marshal( value, self._schema['item'] ) )
				for key, value in self.iteritems()
			) )
			if self._ is not None:	result['_'] = _marshal( self._, self._schema['_'] )
			return result

if __name__=='__main__':

	from simplejson import dumps, loads	

	class A(Container):
		key = int
		item = Object( a=int )
		
	a = A( { '123': A._schema['item']( a=1 ) } )
	a.view.offset = 1
	a.view.count = 1
	
	print a
	b = dumps( _marshal( a, A ) )
	print b
	a = _unmarshal( loads( b ), A )
	print a
	b = dumps( _marshal( a, A ) )
	print b

	class O(Object):
		b = int

	class A(Node):
		a = O
		class B(Container):
			item=O

	a = {}
	a[A.a] = A.a._url
	a[A.B.item] = A.B.item._url
	print a
