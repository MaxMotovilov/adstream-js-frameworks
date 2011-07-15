#!/usr/bin/python

import adstream
from adstream.data import *
import os, urllib, re, sys, traceback, string
import simplejson as json
	
def namedParameters():
    result = {}
    for i in sys.argv:
        m = re.match( r'--([a-zA-Z]+)(?:=(.+))?', i )
        if m:   result[ m.group(1) ] = (lambda x: x if x != None else True)( m.group(2) )
    return result

localpath = os.path.abspath(os.path.dirname(__file__))

##########################################################

"""
	/primary
		/elements
			/item
				name: string
	/secondary
		/collections
			/item
				elements: [ name... ]
		/connectors
			primary: dict
"""

elements = { 'Element 1' : 1, 'Element 2' : 1, 'Element 3' : 1 }
elements_by_id = { 1: 'Element 1', 2: 'Element 2', 3: 'Element 3' }
collections = { 1: [ 'Element 1' ], 2: [ 'Element 2', 'Element 3' ] }
				
class Primary(Service):

	class schema(Node):
		class elements(Container):
			key = int
			class item(Object):
				name = str

	@get(schema.elements.item, key_depth=1)
	def get_items( self, key, response ):
		if len(key)>0:
			key = key[0]
			if key not in elements_by_id:
				raise Error( 404, '/elements/%d does not exist' % key )
			response[Primary.schema.elements.item][key] = Primary.schema.elements( name=elements_by_id[key] )
		else:
			response[Primary.schema.elements.item] = dict( ( 
				( k, Primary.schema.elements.item( name=v ) ) 
				for k,v in elements_by_id.iteritems()
			) )

class Secondary(Service):

	def __init__( self, primary ):
		self.primary = primary
		super(Secondary,self).__init__()

	def getPrimary( self ):
		return json.loads( self.primary( 'GET', '/elements?depth=1' )[2] )

	class schema(Node):
		class collections(Container):
			key = int
			class item(Object):
				elements = Array(str)

		class connectors(Object):
			primary = dict

	@get(schema.collections.item, key_depth=1)
	def get_items( self, key, response ):
		if len(key)>0:
			key = key[0]
			if key not in collections:
				raise Error( 404, '/collections/%d does not exist' % key )
			response[Secondary.schema.collections.item][key] = Secondary.schema.collections.item( elements=collections[key] )
		else:
			response[Secondary.schema.collections.item] = dict( ( 
				( k, Secondary.schema.collections.item( elements=v ) ) 
				for k,v in collections.iteritems()
			) )

	@create(schema.collections.item, key_depth=1)
	def add_items( self, kvps, response, request ):
		primary_updated = False
		for k, v in kvps:
			key = len(collections)+1
			collections[key] = v.elements
			for elt in v.elements:
				if elt not in elements:
					elements[elt] = 1
					elements_by_id[len(elements_by_id)+1] = elt
					primary_updated = True
			response[Secondary.schema.collections.item][key] = v
		if primary_updated:
			response['connectors'] = Secondary.schema.connectors( primary = self.getPrimary() )

def getStatic( path ):
	m = re.search( '[.]([^.]*)$', path )

	headers = {}
	if m:
		headers['Content-Type'] = {
			'html': 'text/html', 'css': 'text/css', 'js': 'application/javascript',
			'gif': 'image/gif', 'jpeg': 'image/jpeg', 'png': 'image/png',
			'zip': 'application/zip'
		}.get( m.group(1).lower(), 'text/plain' )
		
	path = os.path.abspath( os.path.join( localpath, path ) )

	try:
		return ( 200, headers, open( path, 'r' ) )
	except:
		return ( 404, {}, 'File %s cannot be found' % path )
		
httpStatusCodes = {
	200: 'OK', 302: 'FOUND', 400: 'BAD REQUEST', 401: 'UNAUTHORIZED', 404: 'NOT FOUND', 
	405: 'METHOD NOT ALLOWED', 409: 'CONFLICT', 410: 'GONE', 500: 'INTERNAL ERROR'
}
	
primary = Primary()
secondary = Secondary( primary )
	
def wsgi_application( env, wsgi_cb ):

	if env['PATH_INFO'].startswith( '/static' ):
		code, headers, result = getStatic( env['PATH_INFO'][8:] )	
	elif env['PATH_INFO'].startswith( '/primary/' ) or env['PATH_INFO'].startswith( '/secondary/' ):
		svc, url = re.match( r'/([^/]+)/(.*)$', env['PATH_INFO'] ).groups((1,2))
		svc = { 'primary': primary, 'secondary': secondary }[svc]
		if env['REQUEST_METHOD'] in { 'GET':1, 'DELETE':1 }:
			code, headers, result = svc( env['REQUEST_METHOD'], url + '?' + env['QUERY_STRING'] )
		else:
			code, headers, result = svc( env['REQUEST_METHOD'], url + '?' + env['QUERY_STRING'], env['wsgi.input'].read( int(env['CONTENT_LENGTH']) ) )
	else:
		code, headers, result = ( 404, {}, 'Unknown URL: %s' % env['PATH_INFO'] )

	if 'Content-Type' not in headers:	headers['Content-Type'] = 'text/plain'

	wsgi_cb( str(code) + ' ' + httpStatusCodes.get( code, 'ERROR' ), headers.items() )
	return result

if __name__=="__main__":
    
	params = namedParameters()
	port = params.get('socket', 8080)

	from twisted.web import server
	from twisted.web.wsgi import WSGIResource
	from twisted.python.threadpool import ThreadPool
	from twisted.python import log
	from twisted.internet import reactor
	from twisted.application import service, strports

	# Create and start a thread pool,
	wsgiThreadPool = ThreadPool(1,1)
	wsgiThreadPool.start()

	# ensuring that it will be stopped when the reactor shuts down
	reactor.addSystemEventTrigger('after', 'shutdown', wsgiThreadPool.stop)

	reactor.listenTCP( port, server.Site( WSGIResource(reactor, wsgiThreadPool, wsgi_application) ) )
	log.startLogging( log.FileLogObserver( sys.stderr ) )
	reactor.run()
	
