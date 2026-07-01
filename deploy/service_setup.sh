sudo cp ./zhiceyungou.service /etc/systemd/system/zhiceyungou.service
sudo systemctl daemon-reload
sudo systemctl enable zhiceyungou
sudo systemctl start zhiceyungou
sudo systemctl status zhiceyungou
sudo journalctl -u zhiceyungou.service -f