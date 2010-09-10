#!/usr/bin/python

import os, urllib, re, wsgiref, wsgiref.simple_server, sys, traceback, string
import simplejson as json

def namedParameters():
    result = {}
    for i in sys.argv:
        m = re.match( r'--([a-zA-Z]+)=(.+)', i )
        if m:   result[ m.group(1) ] = m.group(2)
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
		kwargs['headers']['Content-Type'] = 'application/json'
		return json.dumps( f( *args, **kwargs ) )
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

try:
	db = json.loads( open( os.path.join( localpath, 'books.db.json' ), 'r' ).read() )
except:
	db = { 'books': {}, 'authors': {}, 'last_id': 0 }

def regexFromSearchPattern( search ):
	return re.compile( '\\b' + '.*?\\b'.join( ( i for i in re.split( '[^a-zA-Z0-9]+', search ) if i ) ), re.I )

def authorMatches( author, search=None, **kwargs ):
	return not search or ( regexFromSearchPattern( search ) if type(search)==str else search ).search( author['firstName'] + ' ' + author['lastName'] )

def bookMatches( book, search=None, author=None, **kwargs ):
	if author and author not in book['authors']:	
		return False
	if search:
		regex = regexFromSearchPattern( search )
		return regex.search( book['title'] ) or any( ( authorMatches( db['authors'][i], regex ) for i in book['authors'] ) )
	return True		

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

def reprAuthor( author_id, with_id=True ):
	result = dict(( a for a in db['authors'][author_id].iteritems() if a[0] != '_' ))
	if with_id:	result['id'] = author_id
	return result

def reprBook( book ):
	v = dict( book )
	v['_'] = dict( v['_'] )
	v['authors'] = [ reprAuthor( i ) for i in v['authors'] ]
	return v

def wrappedBook( book_id ):
	return { 'books/' + str(book_id): reprBook( db['books'][book_id] ) }

def wrappedAuthor( author_id ):
	return { 'authors/'+str(author_id): db['authors'][author_id] }

def matchAuthor( author ):
	for i in db['authors'].iterkeys():
		if reprAuthor( i, False ) == author:
			return (i,False)
	
	author['_'] = { 'version': 1 }
	db['last_id'] = db['last_id']+1
	author_id = str(db['last_id'])
	db['authors'][author_id] = author
	return (author_id,True)

def matchBookAuthors( book ):

	new_author_ids = []
	
	for j in xrange( 0, len(book['authors']) ):
		if type(book['authors'][j]) == dict:
			if 'id' in book['authors'][j]:
				del book['authors'][j]['id']
			book['authors'][j],new = matchAuthor( book['authors'][j] )
			if new: new_author_ids.append( book['authors'][j] )
		elif book['authors'][j] not in db['authors']:
			raise HTTPError( 400, 'Author does not exist' )
	return new_author_ids

def trimView( result, sort_key, offset, count ):
	if offset==None and count==None: return
	
	keys = sorted( [ i for i in result.keys() if i != '_' ], lambda a,b: cmp( result[a][sort_key], result[b][sort_key] ) )
	
	offset = offset or 0

	if offset: 
		for key in keys[:offset]:
			del result[key]

	if count:
		for key in keys[offset+count:]:
			del result[key]

	result['_']['view'] = { 'offset': offset, 'count': min(len(keys)-offset,count or 1000000000) }

def saveDb():
	f = open( os.path.join( localpath, 'books.db.json' ), 'w' )
	f.write( json.dumps( db, indent=2 ) )
	f.close()

@no_input 
@as_json
def getBooks( search=None, author=None, count=None, offset=None, **kwargs ):
	books = { '_': { 'depth': 1 } }

	for i in db['books'].iteritems():
		book_id, book = i
		if bookMatches( book, search, author ):
			books[book_id] = reprBook( book )

	trimView( books, 'title', offset, count )
	
	if search: books['_'].setdefault( 'filter', {} )['search'] = search
	if author: books['_'].setdefault( 'filter', {} )['author'] = author

	return { 'books' : books }

@json_input 
@as_json
def addBooks( data, **kwargs ):

	data = normalizePostData( data, 'books' )
	books = {}
	new_authors = []

	for i in data.iteritems():
		temp, book = i

		new_authors.extend( matchBookAuthors( book ) )

		book.setdefault('_', {})['version'] = 1
		db['last_id'] = db['last_id']+1
		book_id = str(db['last_id'])
		db['books'][book_id] = book

		if bookMatches( book, **kwargs ):
			book = reprBook( book )
			book['_']['replaces'] = '@'+temp
			books[book_id] = book
		else:
			books['@'+temp] = None

	saveDb()

	result = { 'books' : books }
	
	if len(new_authors):
		result['authors'] = dict( ( (i,reprAuthor(i,False)) for i in new_authors ) )

	return result

@no_input 
@as_json
def getBook( book_id, **kwargs ):
	
	if book_id not in db['books']:
		raise HTTPError( 404, 'Book does not exist' )

	return wrappedBook( book_id )

@json_input 
@as_json
def putBook( data, book_id, **kwargs ):

	if book_id not in db['books']:
		raise HTTPError( 404, 'Book does not exist' )	

	new_authors = []

	for i in data.iteritems():
		path,value = i
		if path != 'books/' + str(book_id):
			raise HTTPError( 400, 'Bad PUT data element: ' + path )
		if '_' not in value or 'version' not in value['_']:
			raise HTTPError( 400, 'PUT data do not specify the version' )
		if value['_']['version'] != db['books'][book_id]['_']['version']:
			raise HTTPError( 409, 'Modification collision', wrappedBook( book_id ) )
		
		new_authors.extend( matchBookAuthors( value ) )

		value['_']['version'] = value['_']['version'] + 1
		db['books'][book_id] = value

	saveDb()

	result = wrappedBook( book_id )

	if len(new_authors):
		result['authors'] = dict( ( (i,reprAuthor(i,False)) for i in new_authors ) )

	return result

@no_input 
@as_json
def deleteBook( book_id, **kwargs ):

	if book_id not in db['books']:
		raise HTTPError( 404, 'Book does not exist' )

	if 'version' not in kwargs:
		raise HTTPError( 400, 'DELETE does not specify the version' )

	if kwargs['version'] != db['books'][book_id]['_']['version']:
		raise HTTPError( 409, 'Modification collision', wrappedBook( book_id ) )

	del db['books'][book_id]

	saveDb()

	return { 'books/' + str(book_id): None }

@no_input 
@as_json
def getAuthors( search=None, count=None, offset=None, **kwargs ):
	authors = { '_': { 'depth': 1 } }

	for i in db['authors'].iteritems():
		author_id, author = i
		if authorMatches( author, search ):
			authors[author_id] = author
	
	trimView( authors, 'lastName', offset, count )

	if search: authors['_'].setdefault( 'filter', {} )['search'] = search

	return { 'authors' : authors }

@no_input 
@as_json
def getAuthor( author_id, **kwargs ):
	if author_id not in db['authors']:
		raise HTTPError( 404, 'Author does not exist' )

	return wrappedAuthor( author_id )

@json_input 
@as_json
def putAuthor( data, author_id, **kwargs ):

	if author_id not in db['authors']:
		raise HTTPError( 404, 'Author does not exist' )

	for i in data.iteritems():
		path,value = i
		if path != 'authors/' + str(author_id):\
			raise HTTPError( 400, 'Bad PUT data element: ' + path )
		if '_' not in value or 'version' not in value['_']:
			raise HTTPError( 400, 'PUT data do not specify the version' )
		if value['_']['version'] != db['authors'][author_id]['_']['version']:
			raise HTTPError( 409, 'Modification collision', wrappedAuthor( author_id ) )

		value['_']['version'] = value['_']['version'] + 1
		db['authors'][author_id] = value

		for book in db['books'].itervalues():
			if author_id in book['authors']:
				book['_']['version'] = book['_']['version']+1

	saveDb()

	return wrappedAuthor( author_id )

@no_input
def getStatic( path_name, headers={}, **kwargs ):
	m = re.search( '[.]([^.]*)$', path_name )
	if m:
		headers['Content-Type'] = {
			'html': 'text/html', 'css': 'text/css', 'js': 'application/javascript',
			'gif': 'image/gif', 'jpeg': 'image/jpeg', 'png': 'image/png'
		}.get( m.group(1).lower(), 'text/plain' )
	
	path = os.path.abspath( os.path.join( localpath, path_name ) )

	return open( path, 'r' )

##########################################################

urlMap = [
	( re.compile( '^[/]books[/]?$' ), { 'GET': getBooks, 'POST': addBooks } ),
	( re.compile( '^[/]books[/](\\d+)$' ), { 'GET': getBook, 'PUT': putBook, 'DELETE': deleteBook } ),
	( re.compile( '^[/]authors[/]?$' ), { 'GET': getAuthors } ),
	( re.compile( '^[/]authors[/](\\d+)$' ), { 'GET': getAuthor, 'PUT': putAuthor } ),
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
    httpd = wsgiref.simple_server.make_server( '', params.get('socket', 8080), wsgi_application )
    httpd.serve_forever()
