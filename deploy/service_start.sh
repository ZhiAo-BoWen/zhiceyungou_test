#!/bin/bash

cd /home/admin/zhiceyungou_test

/home/admin/miniconda3/envs/zhiceyungou_test/bin/gunicorn -b ${FLASK_HOST}:${FLASK_PORT} -w 4 app:app