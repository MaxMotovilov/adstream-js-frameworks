#!/usr/bin/env python

import packet
import schema
import simplejson as json

import urlparse, sys, traceback, itertools

class _SvcMethod(object):
	def __init__( self, *arg, **kwarg ):
		self.verb, self.method, self.schema_type = arg
		self.__dict__.update( kwarg )
		self.arg_count = self.method.func_code.co_argcount - len(self.method.func_defaults or ())
		self.kwarg_names = [
			name if name in self.__call__.func_code.co_varnames[ 1+self.arg_count : self.__call__.func_code.co_argcount ] else None
			for name in self.method.func_code.co_varnames[ self.arg_count : self.method.func_code.co_argcount ]
		]
		
	def callMethod( self, *args ):
		self.method(
			*args[:self.arg_count],
			**dict( (
				( self.kwarg_names[i], args[i+self.arg_count] )
				for i in xrange( 0, min( len(self.kwarg_names), len(args)-self.arg_count ) ) if self.kwarg_names[i] is not None
			) )
		)

#
#   get_Method( key, response, request, depth )
#
#	Constructs and adds one or more objects to response based on complete or partial key.
#

class _SvcGetMethod(_SvcMethod):
	def __init__( self, *arg, **kwarg ):
		_SvcMethod.__init__( self, 'get', *arg, **kwarg )
		
	def __call__( self, svc, key, response, request, depth ):
		url = self.schema_type._url
		key_length = url.count( '%' )
		if len(key) > key_length:
			raise ValueError( 'Key %s is too long for "%s"' % ( key, url ) )
		if len(key) < key_length - self.key_depth:
			for k, _ in itertools.groupby( response[self.schema_type][key].iteritems(), lambda kv: kv[0][:key_length - self.key_depth] ):
				self.callMethod( svc, k, response, request, depth )
		else:	self.callMethod( svc, key, response, request, depth )
		
def get( schema_type, depth=None, key_depth=0 ):
	if depth is None:
		depth = 1 if schema.is_a( schema_type, schema.Container ) else 0
	def wrapper( method ):
		return _SvcGetMethod( method, schema_type, depth = depth, key_depth = key_depth )
	return wrapper

#
#   create_Method( key_object_pair_or_iterable, response, request )
#
#	Generates the rest of the key for objects and adds to response.
#

class _SvcCreateMethod(_SvcMethod):
	def __init__( self, *arg, **kwarg ):
		_SvcMethod.__init__( self, 'create', *arg, **kwarg )
		
	def __call__( self, svc, ko_pairs, response, request ):
		if type(ko_pairs) == tuple:	ko_pairs = [ ko_pairs ]
		if self.key_depth==0:
			for ko_pair in ko_pairs:
				self.callMethod( svc, ko_pair, response, request )
		else:
			key_depth = -self.key_depth
			if self.schema_type._url[-2:] == '%s':	key_depth += 1
			if key_depth==0:
				self.callMethod( svc, ko_pairs, response, request )
			else:
				for _,seq in itertools.groupby( ko_pairs, lambda ko_pair: ko_pair[0][:key_depth] ):
					self.callMethod( svc, seq, response, request )
		
def create( schema_type, depth=0, key_depth=0 ):
	def wrapper( method ):
		return _SvcCreateMethod( method, schema_type, depth = depth, key_depth=key_depth )
	return wrapper
	
#
#   update_Method( object_or_iterable, response, request )
#
#	Update objects, populate versions, add to response
#

class _SvcUpdateMethod(_SvcMethod):
	def __init__( self, *arg, **kwarg ):
		_SvcMethod.__init__( self, 'update', *arg, **kwarg )
		
	def __call__( self, svc, objects, response, request ):
		if isinstance( objects, schema._SchemaCore ):	objects = [ objects ]
		if self.key_depth==0:
			for obj in objects:
				self.callMethod( svc, obj, response, request )
		else:
			key_depth = -self.key_depth
			if self.schema_type._url[-2:] == '%s':	key_depth += 1
			if key_depth==0:
				self.callMethod( svc, objects, response, request )
			else:
				for _,seq in itertools.groupby( objects, lambda obj: obj._key_[:key_depth] ):
					self.callMethod( svc, seq, response, request )
		

def update( schema_type, depth=None, key_depth=0 ):
	if depth is None:
		depth = 1 if schema.is_a( schema_type, schema.Container ) else 0
	def wrapper( method ):
		return _SvcUpdateMethod( method, schema_type, depth = depth, key_depth = key_depth )
	return wrapper

#
#   delete_Method( key_version_pair_or_iterable, response, request )
#
#	Delete objects, add nulls to response
#

class _SvcDeleteMethod(_SvcMethod):
	def __init__( self, *arg, **kwarg ):
		_SvcMethod.__init__( self, 'delete', *arg, **kwarg )
		
	def __call__( self, svc, kvps, response, request ):
		if type(kvps) == tuple:	kvps = [ kvps ]
		if self.key_depth==0:
			for kvp in ko_pairs:
				self.callMethod( svc, kvp, response, request )
		else:
			key_depth = -self.key_depth
			if self.schema_type._url[-2:] == '%s':	key_depth += 1
			if key_depth==0:
				self.callMethod( svc, kvps, response, request )
			else:
				for _,seq in itertools.groupby( kvps, lambda kvp: kvp[0][:key_depth] ):
					self.callMethod( svc, seq, response, request )

def delete( schema_type, key_depth=0 ):
	def wrapper( method ):
		return _SvcDeleteMethod( method, schema_type, key_depth = key_depth )
	return wrapper

class Error(Exception):
	def __init__( self, status, message ):
		self.status = status
		self.message = message
			
def _wrap200( response ):
	return ( 200, { 'Content-Type': 'application/json' }, response.serialize() )
			
def _wrapError( status, message ):
	return ( status, { 'Content-Type': 'text/plain' }, message )

def _wrap500( exc_info ):
	return ( 500, { 'Content-Type': 'text/plain' }, ''.join( traceback.format_exception( *exc_info ) ) )
			
def _wrap405( message, verbs ):
	return ( 405, { 'Content-Type': 'text/plain', 'Allow': ', '.join( verbs ) }, message )
				
def _wrap409( message, response ):
	response = response.serialize( as_type=dict )
	response[ '_error' ] = { 'message': message }
	return ( 409, { 'Content-Type': 'application/json' }, json.dumps( response ) )

class _UrlTreeNode(object):

	__slots__ = ( 'children', 'handlers', 'schema_type' )

	def __init__( self, *arg ):
		self.children, self.handlers, self.schema_type = arg	

	def __repr__( self ):
		return repr( ( self.children, self.handlers, self.schema_type ) )
		
def _is_new_key( k ):
	return any( itertools.imap( schema._is_fake_key, k ) )
		
def _version_of( v ):
	return getattr( getattr( v, '_', None ), 'version', None )
	
def _is_deleted_item( v ):		
	return v is None or _version_of( v ) is not None
	
class Service(object):

	@classmethod
	def _register( cls, svc_method ):
		t = cls._url_tree
		st = cls.schema
		for p in svc_method.schema_type._url.split( '/' ):
			if p=='%s':
				if t.children is None:	t.children = _UrlTreeNode( None, {}, t.schema_type._schema['item'] )
				t = t.children
			else:
				if t.children is None: t.children = {}
				t = t.children.setdefault( p, _UrlTreeNode( None, {}, t.schema_type._schema[p] ) )
		if t.handlers is None:	t.handlers = {}
		t.handlers[ svc_method.verb ] = svc_method
			
	class __metaclass__(type):
		def __new__( meta, name, bases, dct ):
			result = type.__new__( meta, name, bases, dct )
			if hasattr( result, 'schema'):
				result._url_tree = _UrlTreeNode( None, {}, result.schema )
				for v in dct.itervalues():
					if isinstance( v, _SvcMethod ):	result._register( v )
			return result
			
	def __call__( self, verb, url, body = None ):

		url = urlparse.urlparse( url )
		url_args = dict((
				( name, val if len(val)>1 else val[0] )
				for name,val in urlparse.parse_qs( url.query ).iteritems()
			))
		url = url.path[1:] if url.path[:1]=='/' else url.path
		
		request = packet.Packet( self.schema )
		
		if body is None:
			body = {}
			body[ url ] = {}

		try:
			request.deserialize( body, url_args = url_args )
		
			t = self._url_tree
			key = ()
			is_item = False
		
			for name in url.split( '/' ):
				if schema.is_a( t.schema_type, schema.Container ):
					key = key + ( schema._key_convert( name, t.schema_type._schema['key'] ), )
					t = t.children
					is_item = True
				else:
					if t.children is None or name not in t.children:
						return _wrapError( 404, 'No handlers associated with ' + url )
					t = t.children[name]
					is_item = False
			
			is_container = schema.is_a( t.schema_type, schema.Container )
		except:
			return _wrap500( sys.exc_info() )
		
		allow_verbs = set(( 'GET', 'PUT', 'POST', 'DELETE' ))
		if not is_item:			allow_verbs.remove( 'DELETE' )
		if not is_container: 	allow_verbs.remove( 'POST' )
		if verb not in allow_verbs:
			return _wrap405( verb + ' is not supported by ' + url, allow_verbs )
		
		response = packet.Packet( self.schema )
		
		try:
			if verb=='GET':
				self._getObject( t, key, request, response, url_args.get( 'depth', None ) )
			elif verb=='PUT':
				self._modifyObject( t, key, request, response, False )
			elif verb=='DELETE':
				self._deleteObject( t, key, request, response )
			elif verb=='POST':
				self._modifyObject( t, key, request, response, True )
			return _wrap200( response )
		except Error as err:
			if err.status == 405:
				allow_verbs.remove( verb )
				return _wrap405( err.message, allow_verbs )
			elif err.status == 409:
				try:
					response = packet.Packet( self.schema )
					if verb=='DELETE':	self._getObject( t, key, response, None )
					else:				self._getAffected( t, key, request, response )
					return _wrap409( response )
				except:
					return _wrap500( sys.exc_info() )
			else:
				return _wrapError( err.status, err.message )
		except:
			return _wrap500( sys.exc_info() )
	
	def _getObject( self, t, key, request, response, depth ):

		queue = [ ( t, depth, 0 ) ]
		
		while len(queue) > 0:

			t, depth, ignore = queue.pop(0)
			reduce_depth_by = 1

			if ignore == 0:
				if 'get' in t.handlers:
					reduce_depth_by = t.handlers['get'].depth + 1
					t.handlers['get']( self, key, response, request, reduce_depth_by if depth is None else min( depth, reduce_depth_by ) )
				elif schema.is_a( t.schema_type, schema.Container ):
					response[t.schema_type][key] = request[t.schema_type][key]
				elif schema.is_a( t.schema_type, schema.Object ):
					raise Error( 405, 'Object at "%s" does not have a get() method associated' % t.schema_type._url.replace( '%s', '*' ) )
			
				if depth is not None:
					depth = depth - reduce_depth_by
				
				ignore = reduce_depth_by
			
			if t.children and depth is None or depth >= 0:
				if schema.is_a( t.schema_type, schema.Container ):
					queue.append( ( t.children, depth, max( 0, ignore-1 ) ) )
				else:
					for child in t.children.itervalues():
						queue.append( ( child, depth, max( 0, ignore-1 ) ) )
		
	def _modifyObject( self, t, key, request, response, add ):
		
		queue = [ ( t.children, 0, True, True ) ] if add else [ ( t, 0, False, False ) ]
	
		while len(queue) > 0:
			
			t, ignore, add, is_item = queue.pop(0)
			all_of_type = request[t.schema_type]
			if key not in all_of_type:	continue
			all_of_type = all_of_type.slice( key )
			
			if ignore == 0:
				if add:
					if 'create' in t.handlers:
						ignore = t.handlers['create'].depth + 1
						t.handlers['create']( self, (
							(
								tuple( (
									response.replaces[kpart] if schema._is_fake_key( kpart ) else kpart
									for kpart in ( k[:-1] if is_item else k )
								) ),
								v
							)
							for k,v in all_of_type.iteritems()
							if ( schema._is_fake_key( k[-1] ) if is_item else _is_new_key( k ) )
						), response, request )
					elif is_item or schema.is_a( t.schema_type, schema.Object ):
						raise Error( 405, '%s at "%s" does not have a create() method associated'  % (
							'Item' if is_item else 'Object',
							t.schema_type._url.replace( '%s', '*' )
						) )
				else:
					if 'update' in t.handlers:
						ignore = t.handlers['update'].depth + 1
						t.handlers['update']( self, (
							v for k,v in all_of_type.iteritems() if not _is_new_key( k ) and not _is_deleted_item( v )
						), response, request )
					elif schema.is_a( t.schema_type, schema.Container ):
						all_of_type = request[t.children.schema_type].slice( key )
						ignore = 1
						
						# Process deleted items immediately
						all_deleted = [ ( k, _version_of( v ) ) for k,v in all_of_type.iteritems() if _is_deleted_item( v ) ]
						if len( all_deleted ) > 0:
							if 'delete' in t.children.handlers:
								t.children.handlers['delete']( self, all_deleted, response, request )
							else:
								raise Error( 405, 'Item at "%s" does not have a delete() method associated'  % t.children.schema_type._url.replace( '%s', '*' ) )
								
						# Add processing of added items to the queue
						if not packet._is_empty( ( k for k in all_of_type.iterkeys() if _is_new_key( k ) ) ):
							queue.append( ( t.children, 0, True, True ) )
							
					elif schema.is_a( t.schema_type, schema.Object ):
						raise Error( 405, 'Object at "%s" does not have an update() method associated'  % t.schema_type._url.replace( '%s', '*' ) )

			if t.children:					
				if schema.is_a( t.schema_type, schema.Container ):
					queue.append( ( t.children, ignore-1, add, add ) )
				else:
					for child in t.children.itervalues():
						queue.append( ( child, ignore-1, add, False ) )
					
	def _deleteObject( self, t, key, request, response ):
		if 'delete' not in t.handlers:
			raise Error( 405, 'Item at "%s" does not have a delete() method associated'  % t.schema_type._url.replace( '%s', '*' ) )
		if key not in request[t.schema_type]:
			t.handlers['delete']( self, ( key, None ), response, request )
		else:
			t.handlers['delete']( self, ( key, _version_of( request[t.schema_type][key] ) ), response, request )

	def _getAffected( self, t, key, request, response ):
		queue = [ ( t, 0 ) ]
		
		while len(queue) > 0:
			t, ignore = queue.pop(0)
			if ignore==0:
				ignore = 1
				if schema.is_a( t.schema_type, schema.Object ):
					all_of_type = request[t.schema_type]
					if key not in all_of_type:	continue
					all_of_type = all_of_type[key]
					if 'get' not in t.handlers:
						raise Error( 405, 'Object at "%s" does not have a get() method associated' % t.schema_type._url.replace( '%s', '*' ) )
					ignore = t.depth + 1
					for k in all_of_type.iterkeys():
						t.handlers['get']( self, k, response, request, None )

			if t.children:					
				if schema.is_a( t.schema_type, schema.Container ):
					queue.append( ( t.children, ignore-1 ) )
				else:
					for child in t.children.itervalues():
						queue.append( ( child, ignore-1 ) )
		
		
if __name__=='__main__':
	
	from schema import *
	digits = "zero one two three four five six seven eight nine".split(' ')
	
	def toText(n):
		if n==0: return digits[n]
		result = []
		while n>0:
			result.insert( 0, digits[n%10] )
			n = n//10
		return ' '.join( result )
	
	class Test(Service):
	
		class schema(Node):
			class A(Container):
				key = int

				class view(Container.view):
					def __init__( self, offset=0, count=10 ):
						self.offset = offset
						self.count = count
						
				class item(Object):
					a = int
					b = str
					
		@get(schema.A.item,key_depth=1)
		def get_items( self, key, response, request ):
			if len(key)==0:
				offset = request['A'].view.offset
				count =  request['A'].view.count
				for i in xrange( offset+1, offset+count+1 ):
					response[self.schema.A.item][i] = self.schema.A.item( a=i, b=toText(i) )
			else:
				response[self.schema.A.item][key] = self.schema.A.item( a=key[0], b=toText(key[0]) )

		@update(schema.A.item,key_depth=1)
		def update_items( self, objects, response, request ):
			for object in objects:
				response[object._url_()] = object

		@create(schema.A.item,key_depth=1)
		def create_items( self, ko_pairs, response, request ):
			for _,obj in ko_pairs:
				response[self.schema.A.item][obj.a] = obj
				
		@delete(schema.A.item,key_depth=1)
		def delete_items( self, kvps, response, request ):
			for k,_ in kvps:
				response[self.schema.A.item][k] = None
								
	svc = Test()
	print svc( 'GET', '/A/5' )
	print svc( 'GET', '/A' )
	print svc( 'GET', '/A?offset=117&count=3' )
	print svc( 'PUT', '/A/5', '{"A/5":{"a":5,"b":"Five"}}')
	print svc( 'PUT', '/A', '{"A":{"5":{"a":5,"b":"Five"}}}')
	print svc( 'POST', '/A', '{"A/@1":{"a":5,"b":"Five"}}')
	print svc( 'PUT', '/A', '{"A":{"5":{"a":5,"b":"Five"},"@1":{"a":6,"b":"Six"}}}')
	print svc( 'DELETE', '/A/5' )
	print svc( 'PUT', '/A', '{"A":{"5":{"a":5,"b":"Five"},"@1":{"a":6,"b":"Six"},"7":null}}')
	
	