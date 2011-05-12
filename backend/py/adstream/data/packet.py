#! /usr/bin/python

import schema
from schema import _is_schema_element, _unmarshal, _marshal, _convert, _is_fake_key, _key_convert, _combine_url

import simplejson as json
import urlparse, re

class _StructMapping(object):
	def __contains__( self, key ):
		return self.struct.__dict__[key] is not None
		
	def __getitem__( self, key ):
		if key not in self: raise KeyError( "Property '%s.%s' is not set" % ( type(self.struct).__name__, key ) )
		return self.struct.__dict__[key]
		
	def __setitem__( self, key, value ):
		if not _is_schema_element( self.struct._schema[key] ):
			raise TypeError( "Property '%s.%s' of type %s cannot be referenced with an URL" % ( type(self.struct).__name__, key, self.struct._schema[key].__name__ ) )
		setattr( self.struct, key, value )

def _normalize_key( key ):
	return tuple(key) if hasattr( key, '__iter__' ) else (key,)
		
def _fill_key( url, key ):
	subst_count = url.count( '%' )
	if len(key) <= subst_count:
		return url % ( key + ( '%s', )*( subst_count - len(key) ) )
	else:
		raise KeyError( "Key too long: '%s' already refers to a single object" % ( url % key[:subst_count] ) )
		
def _is_empty( seq ):
	for i in seq:	return False
	return True
		
def _single_element( seq ):
	if seq is None or schema._is_schema_element( type(seq) ):	return seq
	first = True
	for elt in seq():
		if not first: raise ValueError( "Sequence contains more than one element" )
		first = False
	if first: raise ValueError( "Sequence contains no elements" )
	return elt
	
class _Sequence(object):

	def __init__( self, pkt, url ):
		self._packet = pkt
		self._url = url
		
	def slice( self, key ):	
		return _Sequence( self._packet, _fill_key( self._url, _normalize_key( key ) ) )
		
	def __getitem__( self, key ):
		key = _normalize_key( key )
		new_url = _fill_key( self._url, key )
		if new_url.find('%')<0:
				return self._packet[new_url]
		else:	return _Sequence( self._packet, new_url )
		
	def __setitem__( self, key, items ):
		key = _normalize_key( key )
		new_url = _fill_key( self._url, key[:-1] )
		if new_url.count('%') == 0:
			if len(key)>0:	raise KeyError( "Key too long: '%s' already refers to a single object" % new_url )
			else:			self._packet[new_url] = _single_element( items )
		elif new_url.count('%') == 1:
			self._packet[new_url%key[-1]] = _single_element( items )
		else:
			for k, v in items.iteritems():
				self._packet[ _fill_key( new_url, ( key[-1], ) + _normalize_key( k ) ) ] = v
		
	_keys_op, _values_op, _items_op = xrange(0,3)
	
	_first_key_part = re.compile( r'\/?%s\/?' )
	
	def _enum_items( self, op, key=() ):
		new_url = _fill_key( self._url, key )
		split = self._first_key_part.split( new_url, 1 )
		if len(split) > 1:
			container, typ = self._packet._descend( split[0], Packet._forced_get_op )
			if container is None: return
			for k in container.iterkeys():
				for result in self._enum_items( op, key + ( _key_convert( k, typ._schema['key'] ),) ):
					yield result
		else:
			if new_url in self._packet:
				yield key if op == self._keys_op else self._packet[new_url] if op == self._values_op else ( key, self._packet[new_url] )
	
	def iterkeys( self ):
		return self._enum_items( self._keys_op )
		
	def itervalues( self ):
		return self._enum_items( self._values_op )
		
	def iteritems( self ):
		return self._enum_items( self._items_op )
		
	__iter__ = iterkeys
		
	def __contains__( self, key ):
		key = _normalize_key( key )
		new_url = _fill_key( self._url, key )
		if new_url.find('%')<0:
				return new_url in self._packet
		else:	return not _is_empty( _Sequence( self._packet, new_url ) )

class Packet(object):

	def __init__( self, schema, top = {} ):
		self._schema = schema
		self._top = dict( top )
		self.replaces = {}

	_get_op, _set_op, _check_op, _forced_get_op, _schema_op = xrange(5)
		
	def _descend( self, url, op ):
	
		p = self._top
		s = self._schema
		in_data = type(p) != dict
		sm = _StructMapping()
		key_types = []

		if len(url):		
			url = url.split( '/' )
			for part in url[:-1] if op == self._set_op else url:
				
				if op != self._schema_op and in_data and p is not None and not hasattr( s, '__getitem__' ):
					sm.struct = p
					p = sm

				if hasattr( s, '__getitem__' ):
					ss = s._schema['item']
					if in_data:	part = schema._key_convert( part, s._schema['key'] )
				else: ss = s._schema[part]

				if op != self._schema_op:			
					if p is None or part not in p:
						if op == self._check_op:
							return False
						elif op == self._get_op:
							raise KeyError( "No data at URL '%s'" % url )
						elif op == self._forced_get_op:
							return None
						elif p is None:
							raise TypeError( "Cannot add children to deleted item at '%s'" % s._url_() )
						p[part] = ss( _= ss._( partial = True ) ) if in_data else {}
					if type(p[part]) != dict:
						in_data = True
						
					p = p[part]
				else:
					if hasattr( s, '__getitem__' ):
						key_types.append( s._schema['key'] )

				s = ss

		elif op == self._set_op:
			return None

		if op == self._schema_op:
			return ( s, key_types )
		elif op == self._check_op:
			return in_data
		elif op == self._set_op:
			if hasattr( s, '__getitem__' ):
				return ( p, s._schema['item'], url[-1] )
			elif in_data:
				sm.struct = p
				return ( sm, s._schema[url[-1]], url[-1] )
			else:
				return ( p, s._schema[url[-1]], url[-1] )
		elif op == self._forced_get_op :
			return ( p, s )
		else:
			if not in_data: raise KeyError( "No data at URL '%s'" % ( '/'.join( url ) ) )
			return p
				
	def __contains__( self, url ):
		return self._descend( url, self._check_op )

	def __getitem__( self, url_or_type ):
		if isinstance( url_or_type, type ):
			return _Sequence( self, url_or_type._url )

		return self._descend( url_or_type, self._get_op )

	def __setitem__( self, url_or_type, item_or_items ):
		if isinstance( url_or_type, type ):
			url_or_type = url_or_type._url
			self[url_or_type][()] = item_or_items
			return

		psn = self._descend( url_or_type, self._set_op )
				
		if psn is None:
			extra = [ i for i in self.itervalues() ]
			new = _convert( item_or_items, self._schema )
			old_key = getattr( new, '_key_', None )
			self._top = new
		else:
			p,s,n = psn
			if n in p:
				extra = [ i for i in self._all_data_items( p[n], url_or_type, self._items_op ) if i[0] != url_or_type ]
			else:
				extra = []
			new = _convert( item_or_items, s )
			old_key = getattr( new, '_key_', None )
			p[n] = new

		if type(p) == dict and new is not None: # Have to take care of _key_
			new._set_key( tuple( (
				_key_convert( val, typ )
				for typ, val in zip(
					self._descend( url_or_type, self._schema_op )[1],
					re.search( s._url.replace( '%s', '([^/]+)' ), url_or_type ).groups()
				)
			) ) )

		if old_key is not None and len(old_key) == len(new._key_) and len(old_key)>0 and \
		   _is_fake_key( old_key[-1] ) and not _is_fake_key( new._key_[-1] ):
			if new._ is None:	new._ = s._( replaces = old_key[-1] )
			else:				new._.replaces = old_key[-1]
		
		if new is not None and new._ and getattr( new._, 'replaces', None ):
			self.replaces[new._.replaces] = new._key_

		for k,v in extra:	self[k] = v
						
	_keys_op, _values_op, _items_op = xrange(0,3)
						
	def _all_data_items( self, p, url, op ):
		if type(p) != dict:
			yield url if op == self._keys_op else p if op == self._values_op else ( url, p )
		else:
			for name, value in p.iteritems():
				for result in self._all_data_items( value, _combine_url( url, name ), op ):
					yield result
				
	def iteritems( self ):			
		return self._all_data_items( self._top, '', self._items_op )

	def itervalues( self ):			
		return self._all_data_items( self._top, '', self._values_op )
		
	def iterkeys( self ):
		return self._all_data_items( self._top, '', self._keys_op )
				
	__iter__ = iterkeys
		
	def deserialize( self, body, url_args = {} ):
		if not isinstance( body, dict ):
			body = json.loads( body )
			
		if not isinstance( url_args, dict ):
			url_args = dict((
				( name, val if len(val)>1 else val[0] )
				for name,val in urlparse.parse_qs( url_args ).iteritems()
			))
			
		for path, value in body.iteritems():
			self[path] = _unmarshal( value, self._descend( path, self._schema_op )[0], url_args = url_args )
			
	def serialize( self, as_type = str ):
		result = {}
		for path, obj in self.iteritems():
			result[path] = _marshal( obj, type(obj) )
		if as_type == type(result): return result
		return as_type( json.dumps( result ) )
		
if __name__ == "__main__":

	from schema import *

	class Root(Node):	
		class all(Container):
			key = int
			class item(Node):
				class some(Container):
					item = Object( a=int )
		
	p = Packet(Root)
	
	p.deserialize( '''
		{
			"all/2/some/2": { "a": 12345 },
			"all/@1/some/3": { "a": 54321 },
			"all/2/some": {
				"1": { "a": 98765 }
			}
		}
	''')
	
	for k,v in p[Root.all.item].iteritems():
		print k, v._key_, v._url_(), _marshal( v, type(v) )

	for k,v in p[Root.all.item.some.item].iteritems():
		print k, v._key_, v._url_(), _marshal( v, type(v) )
		
	p['all/3'] = Root.all.item()
	
	p[Root.all.item.some.item][(3,)] = { '2': Root.all.item.some.item( a=56789 ) }
		
	p['all/@1'] = Root.all.item()
	p[Root.all.item][1] = p['all/@1']

	print p.serialize()

	
	