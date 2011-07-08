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
	/items
		value:	string
"""

items = [ ('Initial item #1',1), ('Initial item #2',1) ]

				
def toItem(tpl):
	return Bulk.schema.items.item( value = tpl[0], _ = Bulk.schema.items.item._( version = tpl[1] ) )

class Bulk(Service):

	class schema(Node):
		class items(Container):
			key = int
			class item(Object):
				value = str

	@get(schema.items.item, key_depth=1)
	def get_items( self, key, response ):
		if len(key)>0:
			key = key[0]-1
			if key > len(items) or items[key] is None:
				raise Error( 404, '/items/%d does not exist' % k )
			response[Bulk.schema.items.item][key+1] = toItem( items[key] )
		else:
			response[Bulk.schema.items.item] = dict( ( 
				( k+1, toItem( items[k] ) ) 
				for k in xrange(0,len(items)) 
				if items[k] is not None 
			) )

	@create(schema.items.item, key_depth=1)
	def add_items( self, kvps, response, request ):
		for k, v in kvps:
			v._ = Bulk.schema.items.item._( version = 1 )
			items.append( ( v.value, 1 ) )
			response[Bulk.schema.items.item][len(items)] = v

	@update(schema.items.item)
	def update_item( self, obj, response ):
		k = obj._key_[0]-1
		if k > len(items) or items[k] is None:
			raise Error( 404, '/items/%d does not exist' % k )
		if obj._.version != items[k][1]:
			raise Error( 409, '/items/%d has been modified' % k )
		obj._.version += 1
		items[k] = ( obj.value, obj._.version )
		response[Bulk.schema.items.item][k+1] = obj
			
	@delete(schema.items.item)
	def delete_item( self, kvp, response ):
		k, ver = kvp
		k = k[0]-1
		if k > len(items) or items[k] is None:
			raise Error( 404, '/items/%d does not exist' % k )
		if ver is None or items[k][1] != ver:
			raise Error( 409, '/items/%d has been modified' % k )
		items[k] = None
		response[Bulk.schema.items.item][k+1] = None

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
	
svc = Bulk()	
	
def wsgi_application( env, wsgi_cb ):

	if env['PATH_INFO'].startswith( '/static' ):
		code, headers, result = getStatic( env['PATH_INFO'][8:] )
	elif env['REQUEST_METHOD'] in { 'GET':1, 'DELETE':1 }:
		code, headers, result = svc( env['REQUEST_METHOD'], env['PATH_INFO'] + '?' + env['QUERY_STRING'] )
	else:
		code, headers, result = svc( env['REQUEST_METHOD'], env['PATH_INFO'] + '?' + env['QUERY_STRING'], env['wsgi.input'].read( int(env['CONTENT_LENGTH']) ) )

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
	
