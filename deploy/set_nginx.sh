cp ./flask_app /etc/nginx/sites-available/flask_app
ln -s /etc/nginx/sites-available/flask_app /etc/nginx/sites-enabled/flask_app
nginx -t
systemctl restart nginx