#!/usr/bin/python

import os, urllib, re, sys, traceback, string
import simplejson as json
	
def namedParameters():
    result = {}
    for i in sys.argv:
        m = re.match( r'--([a-zA-Z]+)(?:=(.+))?', i )
        if m:   result[ m.group(1) ] = (lambda x: x if x != None else True)( m.group(2) )
    return result

def decodeURLParamValue( value ):
	value = urllib.unquote( value )
	try:
		value = int(value)
	except ValueError:
		value = unicode(value,'utf8')
	return value

def decodeURLParam( p ):
    name,value = p.split( '=', 1 )
    return (name, decodeURLParamValue(value))
            
def as_json(f):
	def wrapper( *args, **kwargs ):
		if 'unwrapped' in kwargs: return f( *args, **kwargs )
		kwargs.setdefault('headers',{})['Content-Type'] = 'application/json'
		return json.dumps( f( *args, **kwargs ), ensure_ascii=False ).encode('utf8')
	return wrapper

def json_input(f):
	def wrapper( env, *args, **kwargs ):
		return f( json.loads( env['wsgi.input'].read( int(env['CONTENT_LENGTH']) ) ), *args, **kwargs )
	return wrapper

def no_input(f):
	def wrapper( env, *args, **kwargs ):
		return f( *args, **kwargs )
	return wrapper

class HTTPError (Exception):

	httpStatusCodes = {
		200: 'OK', 400: 'BAD REQUEST', 401: 'UNAUTHORIZED', 404: 'NOT FOUND', 
		405: 'METHOD NOT ALLOWED', 409: 'CONFLICT', 410: 'GONE', 500: 'INTERNAL ERROR'
	}

	def __init__( self, code, message, response = {} ):
		self.response = response
		self.status = str(code) + ' ' + HTTPError.httpStatusCodes.get( code, 'ERROR' )
		self.response.setdefault( '_error', {} )['message'] = message

	def result(self):
		return json.dumps( self.response )

##########################################################

localpath = os.path.abspath(os.path.dirname(__file__))

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

def saveDb():
	f = open( os.path.join( localpath, 'booze.db.json' ), 'w' )
	f.write( json.dumps( db, indent=2, ensure_ascii=False ).encode('utf8') )
	f.close()

try:
	db = json.loads( open( os.path.join( localpath, 'booze.db.json' ), 'r' ).read() )
except:
	traceback.print_exc()
	db = { 'products': {}, 'orders': {}, 'customers': {}, 'last_id': 0 }

saveDb()

splitter = re.compile( r'\W+', re.U )

def regexFromSearchPattern( search ):
	return re.compile( '\\b' + '.*?\\b'.join( ( i for i in splitter.split( search ) if i ) ), re.I | re.U )

def productMatches( product, search=None, price=None, section=None, country=None, vintage=None, **kwargs ):

	return (
		(not search) or (
			regexFromSearchPattern( search ) if type(search)==unicode else search 
		).search( 
			product['name'] + ' ' + product.get( 'description', '' )
		)
	) and (
		(not price) or (
			product['price'] <= price if len(tuple(price))==1 else
			( product['price'] > price[0] and product['price'] <= price[1] )
		)
	) and (
		(not section) or product['section'] == section
	) and (
		(not country) or product.get( 'country', '' ) == country
	) and (
		(not vintage) or product.get( 'vintage', 0 ) == vintage
	)

def customerMatches( customer, search=None, **kwargs ):
	return not search or ( 
		regexFromSearchPattern( search ) if type(search)==str else search 
	).search( 
		customer['name']
	)

def normalizePostData( data, prefix ):

	for i in data.iteritems():
		name,value = i
		if name == prefix: continue
		if name[0:2+len(prefix)] == prefix + '/@':
			data.setdefault( prefix, {} )[name[2+len(prefix):]] = value
			del data[name]
		else:
			raise HTTPError( 400, 'Bad POST data element: ' + name )

	if prefix not in data:
		raise HTTPError( 400, 'No data submitted in a POST' )

	return data[prefix]

def copyObject( obj ):
	v = dict( obj )
	v['_'] = dict( v['_'] )
	return v

def wrapObject( root, obj_id, wrapper = None, source = None ):
	wrapper = wrapper or {}
	( wrapper[root] if root in wrapper else wrapper )[ 
		obj_id if root in wrapper else root + '/' + str(obj_id) 
	] = copyObject( source or db[root][obj_id] )
	return wrapper

def trimView( result, sort_key, offset, count ):
	if offset==None and count==None: return
	
	keys = sorted( [ i for i in result.keys() if i != '_' ], lambda a,b: cmp( result[a][sort_key], result[b][sort_key] ) )
	
	offset = offset or 0
	total = len(result)

	if offset: 
		for key in keys[:offset]:
			del result[key]

	if count:
		for key in keys[offset+count:]:
			del result[key]

	result.setdefault('_',{})['view'] = { 'offset': offset, 'count': min(len(keys)-offset,count or 1000000000), 'orderby': sort_key }
	result['_']['extra'] = { 'totalCount': total }

def copyFilter( result, keys, args ):
	f = [ ( k, args[k] ) for k in keys if k in args ]
	if len(f): result.setdefault( '_', {} )['filter'] = dict( f )

@no_input 
@as_json
def getProducts( orderby=None, count=None, offset=None, **kwargs ):

	result = { 'products': {} }

	for i in db['products'].iteritems():
		product_id, product = i
		if productMatches( product, **kwargs ):
			wrapObject( 'products', product_id, result )

	trimView( result['products'], orderby or 'price', offset, count )
	copyFilter( result['products'], [ 'search', 'price', 'country', 'vintage', 'section' ], kwargs )

	result['products']['_']['depth'] = 1

	return result

@no_input
@as_json
def getProduct( product_id, **kwargs ):

	if product_id not in db['products']:
		raise HTTPError( 404, 'Product does not exist' )

	return wrapObject( 'products', product_id )

@no_input
@as_json
def	getLists( **kwargs ):
	
	countries = set()
	sections = set()
	vintages = set()

	for i in db['products'].itervalues():
		if 'country' in i:	countries.add( i['country'] )
		if 'section' in i:	sections.add( i['section'] )
		if 'vintage' in i:	vintages.add( i['vintage'] )

	return { 'lists': { 
		'countries': sorted(list(countries)), 
		'sections': sorted(list(sections)), 
		'vintages': sorted(list(vintages))
	} }

@no_input 
@as_json
def getCustomers( orderby=None, count=None, offset=None, **kwargs ):

	result = { 'customers': {} }

	for i in db['customers'].iteritems():
		customer_id, customer = i
		if customerMatches( customer, **kwargs ):
			wrapObject( 'customers', customer_id, result )

	trimView( result['customers'], orderby or 'name', offset, count )
	copyFilter( result['customers'], [ 'search' ], kwargs )

	result['customers']['_']['depth'] = 1

	return result

@no_input
@as_json
def getCustomer( customer_id, **kwargs ):
	if customer_id not in db['customers']:
		raise HTTPError( 404, 'Customer does not exist' )

	return wrapObject( 'customers', customer_id )

@json_input
@as_json
def addCustomers( data, **kwargs ):
	
	data = normalizePostData( data, 'customers' )
	customers = {}
	
	for i in data.iteritems():
		temp, customer = i

		customer.setdefault('_', {})['version'] = 1
		db['last_id'] = db['last_id']+1
		customer_id = str(db['last_id'])
		db['customers'][customer_id] = customer
		
		if customerMatches( customer, **kwargs ):
			customer = copyObject( customer )
			customer['_']['replaces'] = '@'+temp
			customers[customer_id] = customer
		else:
			customers['@'+temp] = None

	saveDb()

	return { 'customers': customers }

@no_input
@as_json
def getOrder( order_id, **kwargs ):
	if order_id not in db['orders']:
		raise HTTPError( 404, 'Order does not exist' )

	result = wrapObject( 'orders', order_id )
	order = result['orders'][order_id]

	order['_']['depth'] = 2
	if len(order['items']):	order['items'].setdefault( '_', {} )['depth'] = 1

	return result

def processNewOrderItems( order, data ):
	items = {}

	for i in data.iteritems():
		temp, item = i

		item.setdefault('_', {})['version'] = 1
		item_id = item['productID']
		if item_id not in db['products']:
			raise HTTPError( 400, 'Order item refers to a non-existent product' )
		del item['productID']
		order.setdefault( 'items',{} )[item_id] = item
		
		item = copyObject( item )
		item['_']['replaces'] = ('@' if temp[0] != '@' else '') + temp
		items[item_id] = item

	return items

@json_input
@as_json
def addOrders( data, **kwargs ):

	data = normalizePostData( data, 'orders' )
	orders = {}
	
	for i in data.iteritems():
		temp, order = i

		order.setdefault('_', {})['version'] = 1
		db['last_id'] = db['last_id']+1
		order_id = str(db['last_id'])
		db['orders'][order_id] = order

		items = order.get('items',{})
		order['items'] = {}
		
		items = processNewOrderItems( order, items )

		order = copyObject( order )
		order['items'] = items

		order['_']['replaces'] = '@'+temp
		order['_']['depth'] = 2
		orders[order_id] = order

	saveDb()

	return { 'orders': orders }

@json_input
@as_json
def putOrder( data, order_id, **kwargs ):
	if order_id not in db['orders']:
		raise HTTPError( 404, 'Order does not exist' )
	
	for i in data.iteritems():
		path,value = i
		if path != 'orders/' + str(order_id):
			raise HTTPError( 400, 'Bad PUT data element: ' + path )
		if '_' not in value or 'version' not in value['_']:
			raise HTTPError( 400, 'PUT data do not specify the version' )
		if value['_']['version'] != db['orders'][order_id]['_']['version']:
			raise HTTPError( 409, 'Modification collision', wrapObject( 'orders', order_id ) )

		items = {}
		
		if 'items' in value:
			for k in value['items'].iterkeys():
				if k[0]=='@':
					items[ k ] = value['items'][k]
					del value['items'][k]
				else:
					if items[k]['_']['version'] != db['orders'][order_id]['items'][k]['_']['version']:
						raise HTTPError( 409, 'Modification collision', wrapObject( 'orders', order_id ) )
					items[k]['_']['version'] = items[k]['_']['version'] + 1
		else:
			value['items'] = db['orders'][order_id]['items']

		value['_']['version'] = value['_']['version'] + 1
		db['orders'][order_id] = value

		items = processNewOrderItems( db['orders'][order_id], items )

	saveDb()

	result = getOrder( None, order_id, unwrapped=True, **kwargs )

	for i in items.iteritems():
		result['orders/'+str(order_id)].setdefault('items',{})[i[0]] = i[1]

	return result

@no_input
@as_json
def getOrderItem( order_id, item_id, **kwargs ):
	if order_id not in db['orders'] or item_id not in db['orders'][order_id]['items']:
		raise HTTPError( 404, 'Order or item does not exist' )

	return wrapObject( 'orders/' + str(order_id) + '/items', item_id, source = db['orders'][order_id]['items'][item_id] )

@json_input
@as_json
def addOrderItems( data, order_id, **kwargs ):

	if order_id not in db['orders']:
		raise HTTPError( 404, 'Order does not exist' )

	data = normalizePostData( data, 'orders/' + str(order_id) + '/items' )
	items = processNewOrderItems( db['orders'][order_id], data )
	
	saveDb()

	return dict( ( ( 'orders/' + str(order_id) + '/items', items ), ) )

@json_input
@as_json
def putOrderItem( data, order_id, item_id, **kwargs ):
	if order_id not in db['orders'] or item_id not in db['orders'][order_id]['items']:
		raise HTTPError( 404, 'Order or item does not exist' )

	for i in data.iteritems():
		path,value = i
		if path != 'orders/' + str(order_id) + '/items/' + str(item_id):
			raise HTTPError( 400, 'Bad PUT data element: ' + path )
		if '_' not in value or 'version' not in value['_']:
			raise HTTPError( 400, 'PUT data do not specify the version' )
		if value['_']['version'] != db['orders'][order_id]['items'][item_id]['_']['version']:
			raise HTTPError( 409, 'Modification collision', wrapObject( 'orders/' + str(order_id) + '/items', item_id, source = db['orders'][order_id]['items'][item_id] ) )
		
		value['_']['version'] = value['_']['version'] + 1
		db['orders'][order_id]['items'][item_id] = value

	saveDb()

	return getOrderItem( None, order_id, item_id, unwrapped=True, **kwargs )	
	
@no_input
@as_json
def deleteOrderItem( order_id, item_id, **kwargs ):
	if order_id not in db['orders'] or item_id not in db['orders'][order_id]['items']:
		raise HTTPError( 404, 'Order or item does not exist' )

	if 'version' not in kwargs:
		raise HTTPError( 400, 'DELETE does not specify the version' )

	if kwargs['version'] != db['orders'][order_id]['items'][item_id]['_']['version']:
		raise HTTPError( 409, 'Modification collision', wrapObject( 'orders/' + str(order_id) + '/items', item_id, source = db['orders'][order_id]['items'][item_id] ) )

	del db['orders'][order_id]['items'][item_id]

	saveDb()

	result = {}
	result['orders/' + str(order_id) + '/items/' + str(item_id)] = None

	return result
		
@no_input
def getStatic( path_name, headers={}, **kwargs ):
	m = re.search( '[.]([^.]*)$', path_name )
	if m:
		headers['Content-Type'] = {
			'html': 'text/html', 'css': 'text/css', 'js': 'application/javascript',
			'gif': 'image/gif', 'jpeg': 'image/jpeg', 'png': 'image/png',
			'zip': 'application/zip'
		}.get( m.group(1).lower(), 'text/plain' )
	
	path = os.path.abspath( os.path.join( localpath, path_name ) )

	return open( path, 'r' )

##########################################################

urlMap = [
	( re.compile( '^[/]orders[/]?$' ), { 'POST': addOrders } ),
	( re.compile( '^[/]orders[/](\\d+)$' ), { 'GET': getOrder, 'PUT': putOrder } ),
	( re.compile( '^[/]orders[/](\\d+)[/]items[/]?$' ), { 'GET': getOrder, 'POST': addOrderItems } ),
	( re.compile( '^[/]orders[/](\\d+)[/]items[/](\\d+)$' ), { 'GET': getOrderItem, 'PUT': putOrderItem, 'DELETE': deleteOrderItem } ),
	( re.compile( '^[/]products[/]?$' ), { 'GET': getProducts } ),
	( re.compile( '^[/]products[/](\\d+)$' ), { 'GET': getProduct } ),
	( re.compile( '^[/]lists$' ), { 'GET': getLists } ),
	( re.compile( '^[/]static[/]+(.*)$' ), { 'GET': getStatic } )
]

def dispatch( path, method, env, headers, kwargs ):
	for i in urlMap:
		m = i[0].match( path ) 
		if m:
			if method in i[1]:
				kwargs['headers'] = headers
				return i[1][method]( env, *m.groups(), **kwargs )
			else:
				raise HTTPError( 405, method + ' not valid for ' + path )
	
	raise HTTPError( 404, path + ' not found' )

def wsgi_application( env, wsgi_cb ):

	try:
		
		headers = {}

		result = dispatch( 
			env['PATH_INFO'], env['REQUEST_METHOD'], env, headers,
			dict(( decodeURLParam( p ) for p in env['QUERY_STRING'].split('&') if p ))
		)

		if 'Content-Type' not in headers:	headers['Content-Type'] = 'text/plain'

		wsgi_cb( '200 OK', headers.items() )
		return result

	except HTTPError as err:
		wsgi_cb( err.status, [ ('Content-Type','application/json') ] )
		return err.result()
	except:
		traceback.print_exc()
		err = HTTPError( 500, ''.join( traceback.format_exception_only( sys.exc_info()[0], sys.exc_info()[1] ) ), 
						 { '_error': { 'traceback': traceback.format_tb( sys.exc_info()[2] ) } } )
		wsgi_cb( err.status, [ ('Content-Type','application/json') ] )
		return err.result()		

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
	wsgiThreadPool = ThreadPool()
	wsgiThreadPool.start()

	# ensuring that it will be stopped when the reactor shuts down
	reactor.addSystemEventTrigger('after', 'shutdown', wsgiThreadPool.stop)

	reactor.listenTCP( port, server.Site( WSGIResource(reactor, wsgiThreadPool, wsgi_application) ) )
	log.startLogging( log.FileLogObserver( sys.stderr ) )
	reactor.run()

