from adstream.data import *
from django.http import HttpResponse
import models, simplejson, re
from django.conf import settings
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.models import User
from django.db import IntegrityError
from django.core.exceptions import ObjectDoesNotExist

splitter = re.compile( r'\W+', re.U )

def regexFromSearchPattern( search ):
	return re.compile( '\\b' + '.*?\\b'.join( ( i for i in splitter.split( search ) if i ) ), re.I | re.U )

def findText( what, s ):
	return regexFromSearchPattern( what ).search( s )

class Blah(Service):

	class schema(Node):
		class user(Object):
			name = str
			password = str
			register = bool
			
		class topics(Container):
			key = int
			
			class filter(MetaData):
				search = str
			
			class item(Object):
				title = str
				class messages(Container):
					key = int
					class item(Object):
						user = str
						text = str
						timestamp = int
						inReplyTo = int

	def __call__(self,*arg,**kwarg):
		try:
			self.djangoRequest = kwarg.get( 'djangoRequest', None )
			return super(Blah,self).__call__( *arg )
		finally:
			self.djangoRequest = None
			
	@get( schema.user )
	def get_user( self, _, response ):
		user = self.djangoRequest and self.djangoRequest.user
		if user and not user.is_authenticated():
			name = None
		response['user'] = self.schema.user(
			name = user.username
		) if user else self.schema.user()
		
	@update( schema.user )
	def set_user( self, obj, response ):
		if not obj.name or not obj.password:
			logout( self.djangoRequest )
			user = None
		elif obj.register:
			try:
				User.objects.create_user( obj.name, obj.name + '@foo.bar', password=obj.password )
			except IntegrityError:
				raise Error( 403, 'This user already exists' )

		else:
			if not obj.name and self.djangoRequest.user and self.djangoRequest.user.is_authenticated():
				logout()
			elif obj.name:
				user = authenticate( username=obj.name, password=obj.password )
				if user is None:
					raise Error( 403, 'Incorrect user name or password' )
				if not user.is_active:
					raise Error( 403, 'This user is inactive' )
				login( self.djangoRequest, user )

		self.get_user( None, response )

	@get( schema.topics.item, key_depth=1, depth=1 )
	def get_topics( self, key, response, request ):
		if len(key) == 0:
			response[self.schema.topics.item] = dict((
				( t.id, self.schema.topics.item( title = t.title, messages = self.schema.topics.item.messages() ) )
				for t in models.Topic.objects.all()
				if 'topics' not in request or request['topics'].filter.search is None or \
				   findText( request['topics'].filter.search, t.title ) or \
				   any((
						findText( request['topics'].filter.search, m.text )
						for m in models.Message.objects.filter( topic = t )
				   ))
			))
		else:
			try:
				topic = models.Topic.objects.get( id = key[0] )
				response[self.schema.topics.item][key] = self.schema.topics.item(
					title = topic.id,
					messages = self.schema.topics.item.messages()
				)
			except ObjectDoesNotExist:
				raise Error( 404, '/topics/%d does not exist' % key )
		
	@create( schema.topics.item )
	def add_topic( self, kvp, response, depth=1 ):
		topic = models.Topic.objects.create( title = kvp[1].title )
		response[self.schema.topics.item][topic.id] = schema.copy( kvp[1] )

	@get( schema.topics.item.messages.item, key_depth=2 )
	def get_messages( self, key, response, request ):
		if len(key) == 2:
			try:
				message = models.Message.objects.get( topic__id = key[0], seq = key[1] )
				response[self.schema.topics.item.messages.item][key] = self.schema.topics.item.messages.item(
					text = message.text, user = message.user, timestamp = message.timestamp, inReplyTo = message.inReplyTo
				)
			except ObjectDoesNotExist:
				raise Error( 404, '/topics/%d/messages/%d does not exist' % key )
		else:
			response[self.schema.topics.item.messages.item] = dict((
				(
					( m.topic.id, m.seq ),
					self.schema.topics.item.messages.item(
						text = m.text, user = m.user, timestamp = m.timestamp, inReplyTo = m.inReplyTo
					)
				)
				for m in (models.Message.objects.filter( topic__id = key[0] ) if len(key) else models.Message.objects.all())
					if 'topics' not in request or request['topics'].filter.search is None or \
					   findText( request['topics'].filter.search, m.text )
			))
					
	@create( schema.topics.item.messages.item )
	def add_message( self, kvp, response ):
	
		key, v = kvp
	
		try:
			topic = models.Topic.objects.get( id = key[0] )
		except:
			raise Error( 404, '/topics/%d does not exist' % key[0] )
			
		message = models.Message.objects.create(
			topic = topic, text = v.text, user = v.user, timestamp = v.timestamp,
			inReplyTo = v.inReplyTo or 0,
			seq = 1 + models.Message.objects.filter( topic = topic ).count()
		)
		
		response[self.schema.topics.item.messages.item][(topic.id,message.seq)] = v
				
blah = Blah()

def endPoint( request, url ):
	status, headers, body = blah(
		request.method, '?'.join(( url, request.META['QUERY_STRING'] )),
		request.raw_post_data if request.method in ( 'POST', 'PUT' ) else None,
		djangoRequest = request
	)
	
	response = HttpResponse( body, status = status )
	
	for header, value in headers.iteritems():
		response[header] = value
		
	return response
