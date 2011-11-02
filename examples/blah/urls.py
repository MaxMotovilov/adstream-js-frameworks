from django.conf.urls.defaults import patterns, include, url
import settings

# Uncomment the next two lines to enable the admin:

from django.contrib import admin
admin.autodiscover()

urlpatterns = patterns('',
    # Example:
    # (r'^blah/', include('blah.foo.urls')),

	url(r'^', include( 'website.urls' )),
	url(r'^svc/', include( 'svc.urls' )),	
	
	url(r'^admin/doc/', include('django.contrib.admindocs.urls')),
    url(r'^admin/', include(admin.site.urls)),
	url(r'^accounts/', include('registration.urls')),
)
