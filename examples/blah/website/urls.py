from django.conf.urls.defaults import patterns, include, url
from django.core.urlresolvers import reverse

urlpatterns = patterns('website.views',
    url(r'^/?$', 'home', name='website_startpage'),    
)
