from django.db import models

# Create your models here.

class Topic(models.Model):
	id		= models.AutoField( primary_key = True )
	title	= models.CharField( max_length=256 )
	
class Message(models.Model):
	id		  = models.AutoField( primary_key = True )
	topic	  = models.ForeignKey( Topic, related_name = '+' )
	seq		  = models.PositiveSmallIntegerField( null = False )
	user	  = models.CharField( max_length=64 )
	timestamp = models.IntegerField( null = False )
	text      = models.TextField()
	inReplyTo = models.PositiveSmallIntegerField( null = False )