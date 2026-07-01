sudo cp ./flask_app /etc/nginx/sites-available/flask_app
sudo ln -s /etc/nginx/sites-available/flask_app /etc/nginx/sites-enabled/flask_app
sudo nginx -t
sudo systemctl restart nginx
sudo nginx -t
sudo systemctl restart nginx