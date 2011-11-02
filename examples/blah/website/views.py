# Create your views here.

from django.template import RequestContext
from django.shortcuts import render_to_response
from django.http import HttpResponse

def home(request):
	return render_to_response( 'home.html', {}, context_instance=RequestContext(request) )