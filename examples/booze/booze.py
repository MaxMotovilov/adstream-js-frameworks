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

##########################################################

localpath = os.path.abspath(os.path.dirname(__file__))

def saveDb():
	f = open( os.path.join( localpath, 'booze.db.json' ), 'w' )
	f.write( json.dumps( db, indent=2, ensure_ascii=False ).encode('utf8') )
	f.close()

def loadDb():
	global db
	try:
		db = json.loads( open( os.path.join( localpath, 'booze.db.json' ), 'r' ).read() )
	except:
		traceback.print_exc()
		db = { 'products': {}, 'orders': {}, 'customers': {}, 'last_id': 0 }

loadDb()		
		
"""
	/products
		/<ID>
			name: string,
			price: numeric,
			section: string,
			[ country: string, ]
			[ vintage: numeric, ]
			[ picture: string /* URL */, ]
			[ description: string ]
	/customers
		/<ID>
			name: string
	/orders
		/<ID>
			customerID: numeric,
			date:		numeric /* timestamp */,
			/items
				/<productID>
					[productID: numeric,] /*for new items*/
					quantity:	numeric

	/lists
		sections:  [ string... ],
		countries: [ string... ],
		vintages:  [ number... ]
"""

class	Booze(Node):

	class products(Container):
		class filter(MetaData):
			search = str
			price = float
			section = str
			country = str
			vintage = int
			
		class view(Container.view):
			orderby = str
			
		class extra(MetaData):
			totalCount = int
			
		class item(Object):
			name = str
			price = float
			section = str
			country = str
			vintage = int
			picture = str
			description = str

	class customers(Container):
		class extra(MetaData):
			totalCount = int
			
		class item(Object):
			name = str

	class orders(Container):
		class item(Object):
			customerID = str
			date = int
			
			class items(Container):
				class item(Object):
					productID = str
					quantity = int
	
	class lists(Object):
		sections = Array( str )
		countries = Array( str )
		vintages = Array( int )
		
splitter = re.compile( r'\W+', re.U )

def regexFromSearchPattern( search ):
	return re.compile( '\\b' + '.*?\\b'.join( ( i for i in splitter.split( search ) if i ) ), re.I | re.U )

def productMatches( product, filter ):

	return (
		(not filter.search) or
		regexFromSearchPattern( filter.search ).search( 
			product['name'] + ' ' + product.get( 'description', '' )
		)
	) and (
		(not filter.price) or (
			product['price'] <= filter.price if len(tuple(filter.price))==1 else
			( product['price'] > filter.price[0] and product['price'] <= filter.price[1] )
		)
	) and (
		(not filter.section) or product['section'] == filter.section
	) and (
		(not filter.country) or product.get( 'country', '' ) == filter.country
	) and (
		(not filter.vintage) or product.get( 'vintage', 0 ) == filter.vintage
	)

def customerMatches( customer, filter ):
	return not filter.search or ( 
		regexFromSearchPattern( filter.search ) if type(filter.search)==str else filter.search 
	).search( 
		customer['name']
	)
	
def trimView( result, view, extra = None ):
	if view.offset is None and view.count is None: return result
	orderby = view.orderby or 'price'
	result = sorted( result, lambda a,b: cmp( getattr( a[1], orderby ), getattr( b[1], orderby ) ) )
	
	offset = view.offset or 0
	total = len(result)
	if extra:	extra.totalCount = total

	if view.count is None:	return result[offset:]
	else:					return result[offset:offset+view.count]

class BoozeShack(Service):

	schema = Booze
	
	def commit( self, *arg ):
		saveDb()
		
	def rollback( self, *arg ):
		loadDb()
	
	@get(Booze.lists)
	def get_lists( self, key, response ):
		countries = set()
		sections = set()
		vintages = set()
	
		for i in db['products'].itervalues():
			if 'country' in i:	countries.add( i['country'] )
			if 'section' in i:	sections.add( i['section'] )
			if 'vintage' in i:	vintages.add( i['vintage'] )

		response['lists'] = Booze.lists(
			sections = sorted(list(sections)),
			countries = sorted(list(countries)),
			vintages = sorted(list(vintages))
		)

	@get(Booze.products.item, key_depth=1)
	def get_products( self, key, response, request ):
		if len(key)==0:
			response[Booze.products.item] = dict(
				trimView( [
					( k, Booze.products.item( **v ) )
					for k, v in db['products'].iteritems()
					if productMatches( v, request['products'].filter )
				], request['products'].view, response['products'].extra )
			)
		else:
			try:
				response[Booze.products.item][key] = db['products'][key[0]]
			except KeyError:
				raise Error( 404, '/products/%s does not exist' % key[0] )
			
	@get(Booze.customers.item, key_depth=1)
	def get_customers( self, key, response, request ):
		if len(key)==0:
			response[Booze.customers.item] = dict(
				trimView( [
					( k, Booze.customers.item( **v ) )
					for k, v in db['customers'].iteritems()
					if customerMatches( v, request['customers'].filter )
				], request['customers'].view, response['customers'].extra )
			)
		else:
			try:
				response[Booze.customers.item][key] = db['customers'][key[0]]
			except KeyError:
				raise Error( 404, '/customers/%s does not exist' % key[0] )
				
	@create(Booze.customers.item, key_depth=1)
	def add_customers( self, kvps, response, request ):
		for k, v in kvps:
			v._ = Booze.customers.item._( version = 1 )
			db['last_id'] = db['last_id']+1
			customer_id = str(db['last_id'])
			db['customers'][customer_id] = v._save_()
			if customerMatches( db['customers'][customer_id], request['customers'].filter ):
				response[Booze.customers.item][customer_id] = v
			else:
				response[k] = None

	@get(Booze.orders.item,depth=2)
	def get_order( self, key, response ):
		try:
			response[Booze.orders.item][key] = Booze.orders.item( **db['orders'][key[0]] )
		except KeyError:
			raise Error( 404, '/orders/%d does not exist' % key[0] )
		
	@get(Booze.orders.item.items.item,key_depth=1)
	def get_orderItems( self, key, response ):
		if len(key)==1:
			response[Booze.orders.item.items.item][key] = db['orders'][key[0]]['items']
		else:	
			try:
				response[Booze.orders.item.items.item][key] = Booze.orders.item.items.item( **db['orders'][key[0]]['items'][key[1]] )
			except KeyError:
				raise Error( 404, '/orders/%s/items/%s does not exist' % key )

	@create(Booze.orders.item)
	def add_order( self, kvp, response ):
		db['last_id'] = db['last_id']+1
		order_id = str(db['last_id'])
		created = adstream.data.schema.copy( kvp[1] )
		created._ = Booze.orders.item._( version=1 )
		v = created._save_()
		v['items'] = {}
		db['orders'][order_id] = v
		response[Booze.orders.item][order_id] = created

	@create(Booze.orders.item.items.item)
	def add_orderItem( self, kvp, response ):
		k, v = kvp
		if v.productID not in db['products']:
			raise Error( 400, '/products/%s does not exist' % v.productID )
		v._ = Booze.orders.item.items.item._( version = 1 )
		k = k+(v.productID,)
		v.productID = None
		db['orders'][k[0]]['items'][k[1]] = v._save_()
		response[Booze.orders.item.items.item][k] = v

	@update(Booze.orders.item)
	def update_order( self, obj, response ):
		k = obj._key_
		if k[0] not in db['orders']:
			raise Error( 404, '/orders/%s does not exist' % k[0] )
		if obj._.version != db['orders'][k[0]]['_']['version']:
			raise Error( 409, '/orders/%s has been modified' % k[0] )
		obj._.version += 1
		v = obj._save_()
		if 'items' in v: del v['items']
		db['orders'][k[0]].update( v )
		response[Booze.orders.item][k] = obj
			
	@update(Booze.orders.item.items.item)
	def update_orderItem( self, obj, response ):
		k = obj._key_
		if k[0] not in db['orders'] or k[1] not in db['orders'][k[0]]['items']:
			raise Error( 404, '/orders/%s/items/%s does not exist' % k )
		if obj._.version != db['orders'][k[0]]['items'][k[1]]['_']['version']:
			raise Error( 409, '/orders/%s/items/%s has been modified' % k )
		obj._.version += 1
		db['orders'][k[0]]['items'][k[1]].update( obj._save_() )
		response[Booze.orders.item.items.item][k] = obj

	@delete(Booze.orders.item.items.item)
	def delete_orderItem( self, kvp, response ):
		k, ver = kvp
		if k[0] not in db['orders'] or k[1] not in db['orders'][k[0]]['items']:
			raise Error( 404, '/orders/%s/items/%s does not exist' % k )
		if ver != db['orders'][k[0]]['items'][k[1]]['_']['version']:
			raise Error( 409, '/orders/%s/items/%s has been modified' % k )
		del db['orders'][k[0]]['items'][k[1]]
		response[Booze.orders.item.items.item][k] = None

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
	
svc = BoozeShack()	
	
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
	